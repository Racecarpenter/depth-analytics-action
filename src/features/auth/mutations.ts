"use server";

import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getSmsProvider } from "@/lib/sms";
import { APP_NAME, OTP_EXPIRY_MINUTES, OTP_MAX_ATTEMPTS } from "@/lib/constants";
import { logError } from "@/lib/utils/log-error";
import { otpVerifySchema, phoneRequestSchema } from "@/lib/validations/auth";
import { PRICING } from "@/lib/monetization/pricing";
import { logAnalyticsEvent } from "@/lib/monetization/analytics";

export interface AuthActionResult {
  ok: boolean;
  error?: string;
  phone?: string;
}

function hashCode(phone: string, code: string) {
  const secret = process.env.INVITE_TOKEN_SECRET ?? "";
  return crypto.createHash("sha256").update(`${phone}:${code}:${secret}`).digest("hex");
}

function digitsOnly(phone: string) {
  return phone.replace(/\D/g, "");
}

/**
 * Supabase Auth stores `auth.users.phone` without the leading "+", while
 * every phone value in our own app code (and therefore `public.users.phone`,
 * populated by the on-auth-user-created trigger) is full E.164 with a "+".
 * That mismatch means a plain `.eq("phone", phone)` against `public.users`
 * can miss a row that Supabase itself considers a match. This scans
 * `auth.users` directly (comparing digits-only) as a fallback so we can
 * still find/reconcile the account instead of erroring out.
 */
async function findAuthUserByPhone(admin: ReturnType<typeof createAdminClient>, phone: string) {
  const target = digitsOnly(phone);
  const perPage = 200;
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error || !data?.users?.length) return null;
    const match = data.users.find((u) => u.phone && digitsOnly(u.phone) === target);
    if (match) return match;
    if (data.users.length < perPage) return null;
  }
  return null;
}

/**
 * Step 1 of phone auth: validates the number, generates a 6-digit code,
 * stores its hash, and sends it through the pluggable SmsProvider. The mock
 * provider just logs it to the server console — see src/lib/sms/mock.ts.
 */
export async function requestOtp(rawPhone: string): Promise<AuthActionResult> {
  const parsed = phoneRequestSchema.safeParse({ phone: rawPhone });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a valid phone number." };
  }

  const phone = parsed.data.phone;
  const code = crypto.randomInt(100000, 1000000).toString();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60_000).toISOString();

  const admin = createAdminClient();
  const { error } = await admin
    .from("auth_otp_codes")
    .upsert({ phone, code_hash: hashCode(phone, code), expires_at: expiresAt, attempts: 0 });

  if (error) {
    // Logged server-side (check your `npm run dev` terminal) since the most
    // common causes here are setup issues — migrations not run against this
    // Supabase project, or a wrong/missing SUPABASE_SERVICE_ROLE_KEY — and
    // the raw Postgres/PostgREST error message says exactly which.
    logError("[requestOtp] auth_otp_codes upsert failed:", error);
    return { ok: false, error: "Couldn't send a code right now. Try again." };
  }

  await getSmsProvider().send({
    to: phone,
    body: `${code} is your ${APP_NAME} verification code. It expires in ${OTP_EXPIRY_MINUTES} minutes.`,
  });

  return { ok: true, phone };
}

/**
 * Step 2 of phone auth: verifies the code, then finds-or-creates a Supabase
 * Auth user for that phone number and signs them in.
 *
 * ACTION owns OTP generation/verification itself (rather than Supabase
 * Auth's built-in phone flow) specifically so the SMS provider stays
 * swappable without any Supabase project configuration. To still end up
 * with a real Supabase session, we set a one-time random password on the
 * user server-side and immediately exchange it for a session via
 * signInWithPassword — the password never leaves this function.
 */
export async function verifyOtp(rawPhone: string, rawCode: string): Promise<AuthActionResult> {
  const parsed = otpVerifySchema.safeParse({ phone: rawPhone, code: rawCode });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter the 6-digit code." };
  }
  const { phone, code } = parsed.data;
  const admin = createAdminClient();

  const { data: row } = await admin
    .from("auth_otp_codes")
    .select("*")
    .eq("phone", phone)
    .maybeSingle();

  if (!row) return { ok: false, error: "That code has expired. Request a new one." };

  if (new Date(row.expires_at) < new Date()) {
    await admin.from("auth_otp_codes").delete().eq("phone", phone);
    return { ok: false, error: "That code has expired. Request a new one." };
  }

  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    await admin.from("auth_otp_codes").delete().eq("phone", phone);
    return { ok: false, error: "Too many attempts. Request a new code." };
  }

  if (row.code_hash !== hashCode(phone, code)) {
    await admin.from("auth_otp_codes").update({ attempts: row.attempts + 1 }).eq("phone", phone);
    return { ok: false, error: "That code isn't right. Try again." };
  }

  await admin.from("auth_otp_codes").delete().eq("phone", phone);

  const tempPassword = crypto.randomBytes(24).toString("hex");

  // Prefer our own table (fast, single row), but fall back to scanning
  // auth.users directly — see findAuthUserByPhone for why the first lookup
  // can miss a real match.
  const { data: existing } = await admin.from("users").select("id").eq("phone", phone).maybeSingle();
  const existingId = existing?.id ?? (await findAuthUserByPhone(admin, phone))?.id ?? null;

  let userId: string;
  if (existingId) {
    userId = existingId;
    const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      password: tempPassword,
      phone_confirm: true,
    });
    if (updateError) {
      logError("[verifyOtp] updateUserById failed:", updateError);
      return { ok: false, error: "Couldn't sign you in. Try again." };
    }
  } else {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      phone,
      password: tempPassword,
      phone_confirm: true,
    });
    if (createError || !created.user) {
      logError("[verifyOtp] createUser failed:", createError);
      return { ok: false, error: "Couldn't create your account. Try again." };
    }
    userId = created.user.id;

    // Starter grant, brand-new users only. The partial unique index on
    // action_credit_transactions (one starter_grant row per user) makes this
    // safe to retry — a duplicate insert here is just ignored, not an error.
    const { error: grantError } = await admin.from("action_credit_transactions").insert({
      user_id: userId,
      type: "starter_grant",
      amount: PRICING.starterFreeActions,
      reference_type: "system",
      note: "Starter grant on signup",
    });
    if (grantError && grantError.code !== "23505") {
      logError("[verifyOtp] starter grant insert failed:", grantError);
    } else if (!grantError) {
      await logAnalyticsEvent(admin, {
        eventName: "starter_actions_granted",
        userId,
        metadata: { amount: PRICING.starterFreeActions },
      });
    }
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ phone, password: tempPassword });
  if (signInError) {
    logError("[verifyOtp] signInWithPassword failed:", signInError);
    return { ok: false, error: "Couldn't sign you in. Try again." };
  }

  // Upsert (not just update) so this also backfills/repairs a public.users
  // row that's missing or has a stale phone format — keyed by id, which is
  // never affected by phone formatting.
  const { error: upsertError } = await admin
    .from("users")
    .upsert({ id: userId, phone, phone_verified_at: new Date().toISOString() }, { onConflict: "id" });
  if (upsertError) {
    logError("[verifyOtp] users upsert failed:", upsertError);
  }

  return { ok: true, phone };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
