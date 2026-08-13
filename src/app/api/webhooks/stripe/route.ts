import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { PRICING } from "@/lib/monetization/pricing";
import { logError } from "@/lib/utils/log-error";
import type { Json } from "@/types/database.types";

export const dynamic = "force-dynamic";

/**
 * Fulfillment source of truth for Action Pack / Action Pass purchases.
 * Deliberately never trusts the checkout success redirect — only a
 * signature-verified webhook event grants anything. See the architecture
 * note in src/lib/monetization/pricing.ts and the migration comments in
 * supabase/migrations/0005_monetization.sql for the full idempotency story.
 */
export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Missing signature or webhook secret." }, { status: 400 });
  }

  const rawBody = await request.text();
  const stripe = getStripeClient();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    logError("[stripe webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Dedup the webhook delivery itself, before any business logic runs —
  // Stripe explicitly documents that the same event can be delivered more
  // than once. A unique-violation here means "already processed," not an
  // error.
  const { error: insertEventError } = await admin.from("stripe_webhook_events").insert({
    stripe_event_id: event.id,
    event_type: event.type,
    payload: event as unknown as Json,
  });

  if (insertEventError) {
    if (insertEventError.code === "23505") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    logError("[stripe webhook] failed to record event:", insertEventError);
  }

  if (event.type === "checkout.session.completed") {
    await fulfillCheckoutSession(admin, event.data.object as Stripe.Checkout.Session);
  }

  return NextResponse.json({ ok: true });
}

async function fulfillCheckoutSession(
  admin: ReturnType<typeof createAdminClient>,
  session: Stripe.Checkout.Session,
) {
  const userId = session.client_reference_id;
  const kind = session.metadata?.kind;

  if (!userId || (kind !== "action_pack" && kind !== "action_pass")) {
    logError("[stripe webhook] checkout.session.completed missing/invalid userId or kind:", {
      sessionId: session.id,
      userId,
      kind,
    });
    return;
  }

  // Business-level idempotency guard, independent of the event-id dedup
  // above: stripe_checkout_session_id is unique, so even a different event
  // type somehow referencing the same session can't grant twice.
  const { data: purchase, error: purchaseError } = await admin
    .from("purchases")
    .insert({
      user_id: userId,
      kind,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
      stripe_customer_id: typeof session.customer === "string" ? session.customer : null,
      amount_cents: session.amount_total ?? 0,
      currency: session.currency ?? "usd",
    })
    .select("*")
    .maybeSingle();

  if (purchaseError) {
    if (purchaseError.code === "23505") return;
    logError("[stripe webhook] failed to insert purchase:", purchaseError);
    return;
  }
  if (!purchase) return;

  if (kind === "action_pack") {
    await admin.from("action_credit_transactions").insert({
      user_id: userId,
      type: "action_pack_purchase",
      amount: PRICING.actionPack.quantity,
      reference_type: "purchase",
      reference_id: purchase.id,
      note: `${PRICING.actionPack.label} purchase`,
    });
    await admin.from("analytics_events").insert({
      event_name: "action_pack_purchased",
      user_id: userId,
      metadata: { purchase_id: purchase.id, amount_cents: purchase.amount_cents },
    });
    return;
  }

  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + PRICING.actionPass.durationDays * 24 * 60 * 60 * 1000);
  await admin.from("action_passes").insert({
    user_id: userId,
    started_at: startedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    purchase_id: purchase.id,
  });
  await admin.from("analytics_events").insert({
    event_name: "action_pass_purchased",
    user_id: userId,
    metadata: { purchase_id: purchase.id, amount_cents: purchase.amount_cents },
  });
}
