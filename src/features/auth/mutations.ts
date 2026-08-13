"use server";

import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getSmsProvider } from "@/lib/sms";
import { APP_NAME, OTP_EXPIRY_MINUTES, OTP_MAX_ATTEMPTS, SMS_DISCLOSURE_VERSION } from "@/lib/constants";
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

  // SMS consent record — this call is the exact "affirmative action of
  // entering their phone number and pressing Send Code" moment the
  // disclosure under PhoneForm's button refers to (see SMS_DISCLOSURE_TEXT).
  // Best-effort: a logging failure here should never block someone from
  // signing in. user_id is deliberately looked up rather than required —
  // for a brand-new phone number no account exists yet at this instant, and
  // that's fine; see supabase/migrations/0016_sms_consent.sql.
  const { data: consentUser } = await admin.from("users").select("id").eq("phone", phone).maybeSingle();
  const { error: consentError } = await admin.from("sms_consent_events").insert({
    user_id: consentUser?.id ?? null,
    phone,
    consent_source: "web",
    consent_version: SMS_DISCLOSURE_VERSION,
  });
  if (consentError) logError("[requestOtp] sms_consent_events insert failed:", consentError);

  const sendResult = await getSmsProvider().send({
    to: phone,
    body: `${code} is your ${APP_NAME} verification code. Expires in ${OTP_EXPIRY_MINUTES} min. Reply STOP to opt out.`,
  });

  if (!sendResult.ok) {
    // Never throws (see TwilioSmsProvider) — a failed send is most commonly
    // either a genuine delivery problem or this number having texted STOP
    // to Action before. Either way, the honest and recoverable response is
    // to say so and point at the standard opt-back-in path, not to silently
    // report success or crash with a generic error.
    logError("[requestOtp] SMS send failed:", sendResult.error);
    return {
      ok: false,
      error: "We couldn't text that number. If you've opted out of texts from Action, text START to resume, then try again.",
    };
  }

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

    // Upsert (not just update) so this also backfills/repairs a public.users
    // row that's missing or has a stale phone format — keyed by id, which is
    // never affected by phone formatting. (public.users is also provisioned
    // by the on_auth_user_created trigger in 0001_init.sql the instant
    // admin.auth.admin.createUser() inserts into auth.users — this upsert is
    // a deliberate, redundant backfill on top of that, not a second
    // competing provisioning system: the trigger is the primary path, this
    // just repairs phone formatting/verification timestamp immediately
    // rather than waiting for it.)
    const { error: upsertError } = await admin
      .from("users")
      .upsert({ id: userId, phone, phone_verified_at: new Date().toISOString() }, { onConflict: "id" });
    if (upsertError) {
      logError("[verifyOtp] users upsert failed:", upsertError);
      return { ok: false, error: "Couldn't finish creating your account. Try again." };
    }
  }

  // Starter grant — attempted on every sign-in, new or returning, not just
  // inside the "created a brand-new auth user" branch above. That used to be
  // the only place this ran, which meant a user whose *first* verifyOtp call
  // succeeded at createUser() but failed anywhere after (upsert, an
  // unrelated blip) would retry into the *existing-user* branch on their
  // next attempt — since the trigger had already provisioned public.users —
  // and would never receive a starter grant again. Keying this purely off
  // "does this user already have one" (via the partial unique index on
  // action_credit_transactions, one starter_grant row per user) rather than
  // "which branch did this specific request take" makes it retry-safe and
  // duplicate-safe: every login attempts it, but it only ever actually
  // grants once, and a returning user with an existing grant just no-ops on
  // a unique-violation every time they sign in.
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

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ phone, password: tempPassword });
  if (signInError) {
    logError("[verifyOtp] signInWithPassword failed:", signInError);
    return { ok: false, error: "Couldn't sign you in. Try again." };
  }

  return { ok: true, phone };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
