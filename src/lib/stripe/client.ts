import "server-only";

import Stripe from "stripe";

let cached: Stripe | null = null;

/**
 * Server-only Stripe client. Used exclusively to sell access to create
 * Actions (Action Packs, 30-Day Passes) — never touches, holds, or moves
 * any wager/stake money, which stays entirely outside Stripe and outside
 * this file. See src/features/actions for the wager-adjacent (non-payment)
 * side of the product.
 */
export function getStripeClient(): Stripe {
  if (cached) return cached;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not set.");
  }

  cached = new Stripe(secretKey);
  return cached;
}
