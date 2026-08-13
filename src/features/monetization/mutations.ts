"use server";

import { getCurrentUser } from "@/features/auth/session";
import { getStripeClient } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSmsProvider } from "@/lib/sms";
import { APP_NAME } from "@/lib/constants";
import { logError } from "@/lib/utils/log-error";
import { normalizePhone } from "@/lib/utils/phone";

export interface CheckoutSessionResult {
  ok: boolean;
  error?: string;
  url?: string;
}

/**
 * Creates a Stripe Checkout Session for one of the two paid options.
 * Deliberately does NOT grant anything — fulfillment only ever happens from
 * the webhook (src/app/api/webhooks/stripe/route.ts) once Stripe confirms
 * payment. `returnTo` is the page to send the user back to either way
 * (success or cancel), so checkout doesn't lose their place in the create
 * flow.
 */
export async function createCheckoutSession(
  kind: "action_pack" | "action_pass",
  returnTo: string,
): Promise<CheckoutSessionResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { ok: false, error: "You need to be signed in." };

  const priceId =
    kind === "action_pack" ? process.env.STRIPE_PRICE_ACTION_PACK : process.env.STRIPE_PRICE_ACTION_PASS;
  if (!priceId) {
    logError("[createCheckoutSession] missing price id env var for kind:", kind);
    return { ok: false, error: "Purchases aren't set up yet. Try again later." };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const safeReturnTo = returnTo.startsWith("/") ? returnTo : "/";
  const separator = safeReturnTo.includes("?") ? "&" : "?";

  try {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: currentUser.id,
      metadata: { kind, user_id: currentUser.id },
      success_url: `${appUrl}${safeReturnTo}${separator}checkout=success`,
      cancel_url: `${appUrl}${safeReturnTo}${separator}checkout=cancelled`,
    });

    if (!session.url) {
      return { ok: false, error: "Couldn't start checkout. Try again." };
    }

    return { ok: true, url: session.url };
  } catch (err) {
    logError("[createCheckoutSession] Stripe error:", err);
    return { ok: false, error: "Couldn't start checkout. Try again." };
  }
}

/**
 * Fire-and-forget client-triggered analytics event, logged once when the
 * paywall actually renders for someone (called from Paywall.tsx's mount
 * effect) — a server-render count would also catch prefetches that never
 * really show the user anything.
 */
export async function logPaywallShown(): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;
  const admin = createAdminClient();
  await admin.from("analytics_events").insert({
    event_name: "paywall_shown",
    user_id: currentUser.id,
    metadata: {},
  });
}

export interface ReferralInviteResult {
  ok: boolean;
  error?: string;
}

/**
 * The paywall's "Invite a new opponent" escape hatch. Deliberately not the
 * same code path as createActionAndInvite (features/actions/mutations.ts) —
 * this exists specifically because someone who's out of Actions has to be
 * able to invite a new person *without* creating an Action, or the referral
 * mechanic would be unreachable exactly when it's meant to matter most.
 * Reuses the same `referrals` row / first-touch-wins semantics either way:
 * `triggering_action_id` just stays null here until the referral reward
 * actually fires later, from an ordinary accepted invite (theirs or
 * anyone else's).
 */
export async function sendReferralInvite(rawPhone: string): Promise<ReferralInviteResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { ok: false, error: "You need to be signed in." };

  const phone = normalizePhone(rawPhone);
  if (!phone) return { ok: false, error: "Enter a valid phone number." };
  if (phone === currentUser.phone) return { ok: false, error: "You can't refer yourself." };

  const admin = createAdminClient();

  const { data: existingUser } = await admin.from("users").select("id").eq("phone", phone).maybeSingle();
  if (existingUser) {
    return { ok: false, error: "They're already on ACTION — invite someone who isn't yet." };
  }

  const { error: insertError } = await admin
    .from("referrals")
    .insert({ inviter_user_id: currentUser.id, invitee_phone: phone })
    .select("id")
    .single();

  // A unique-violation on invitee_phone just means someone already holds
  // first-touch attribution for this number — still a genuine invite from
  // this user's point of view, so it's not surfaced as an error.
  if (insertError && insertError.code !== "23505") {
    logError("[sendReferralInvite] failed to insert referral row:", insertError);
    return { ok: false, error: "Something went wrong. Try again." };
  }

  if (!insertError) {
    await admin.from("analytics_events").insert({
      event_name: "referral_started",
      user_id: currentUser.id,
      metadata: { invitee_phone: phone },
    });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  await getSmsProvider().send({
    to: phone,
    body: `${currentUser.display_name ?? "A friend"} invited you to ${APP_NAME} — challenge friends on sports, no money ever changes hands through the app. ${appUrl}`,
  });

  return { ok: true };
}
