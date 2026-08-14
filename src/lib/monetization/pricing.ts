/**
 * The single source of truth for every Action-monetization number. Nothing
 * in features/monetization, features/actions, or the paywall UI should
 * hardcode a quantity or price anywhere else — read it from here so
 * changing "3 free Actions" to "2" (or the pack size, or either price) is a
 * one-file change instead of a codebase search.
 *
 * Stripe's own Prices are the source of truth for what actually gets
 * charged (see STRIPE_PRICE_ACTION_PACK / STRIPE_PRICE_ACTION_PASS in
 * .env.example) — priceCents/priceDisplay here are for UI copy only. If you
 * change a price, update it in the Stripe Dashboard too and keep this in
 * sync, or the checkout amount and the UI copy will disagree.
 */
export const PRICING = {
  /** Lifetime, one-time, never resets. */
  starterFreeActions: 3,

  /** Earned once per genuinely-new referred user, on their first accepted Action. */
  referralRewardActions: 1,

  actionPack: {
    quantity: 5,
    priceCents: 199,
    priceDisplay: "$1.99",
    label: "5 Actions",
    description: "For the occasional rivalry.",
  },

  actionPass: {
    durationDays: 30,
    priceCents: 399,
    priceDisplay: "$3.99",
    label: "30-Day Action Pass",
    description: "Unlimited Action for 30 days.",
    disclaimer: "No subscription. No auto-renewal.",
  },

  /**
   * Beta-only, free, repeatable — NOT a purchase. See
   * src/features/monetization/lib/beta-credits.ts and README ("Beta testing
   * access"). Only ever granted to authorized beta testers, only while
   * ENABLE_BETA_FREE_CREDITS=true, and only when their balance has actually
   * reached the paywall — never shown or usable by production users.
   */
  betaGrantActions: 5,
} as const;
