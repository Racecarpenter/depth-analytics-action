"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_NAME } from "@/lib/constants";
import { PRICING } from "@/lib/monetization/pricing";
import { createCheckoutSession, logPaywallShown, sendReferralInvite } from "../mutations";
import { BetaPaywallCredits } from "./beta-paywall-credits";

const CHECKOUT_POLL_ATTEMPTS = 6;
const CHECKOUT_POLL_INTERVAL_MS = 2000;

/**
 * Shown in place of the Action-creation flow once someone's out of Actions
 * and doesn't have an active Pass. Three production paths, matching the
 * product brief exactly: refer someone in for free, buy a small pack, or go
 * unlimited for 30 days. `returnTo` is the current pathname, so Stripe
 * Checkout comes back to exactly where this was shown.
 *
 * `justPurchased` is passed true when the URL has `?checkout=success` (set
 * by the caller reading searchParams) — Stripe's redirect lands here before
 * the webhook necessarily has, so this briefly polls via router.refresh()
 * until the parent page's entitlement check picks up the new balance/pass
 * and stops rendering this component at all.
 *
 * `actionPackPurchasable`/`actionPassPurchasable` reflect whether Stripe is
 * actually configured for that price (see the two NewAction*Page callers,
 * which check for STRIPE_PRICE_ACTION_PACK/STRIPE_PRICE_ACTION_PASS) — when
 * false, that card stays visible (so the pricing/copy can still be
 * evaluated) but its button reads "Coming soon" and does nothing, so nobody
 * can wander into a checkout session that was never going to work. This is
 * independent of beta status: it's "is Stripe live," not "is this a beta
 * tester," and requires no code change to flip back on once it's live.
 *
 * `betaCreditsAvailable` is the one beta-specific prop — true only when the
 * server has already confirmed both that this user is an authorized beta
 * tester and ENABLE_BETA_FREE_CREDITS is on (see
 * features/monetization/lib/beta-credits.ts). See README ("Beta testing
 * access") for the whole feature.
 */
export function Paywall({
  returnTo,
  justPurchased = false,
  actionPackPurchasable = true,
  actionPassPurchasable = true,
  betaCreditsAvailable = false,
}: {
  returnTo: string;
  justPurchased?: boolean;
  actionPackPurchasable?: boolean;
  actionPassPurchasable?: boolean;
  betaCreditsAvailable?: boolean;
}) {
  const [phone, setPhone] = useState("");
  const [referralError, setReferralError] = useState<string | undefined>();
  const [referralSent, setReferralSent] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | undefined>();
  const [pendingKind, setPendingKind] = useState<"action_pack" | "action_pass" | null>(null);
  const [isReferralPending, startReferralTransition] = useTransition();
  const [isCheckoutPending, startCheckoutTransition] = useTransition();
  const [pollAttemptsLeft, setPollAttemptsLeft] = useState(justPurchased ? CHECKOUT_POLL_ATTEMPTS : 0);
  const router = useRouter();
  const attemptsRef = useRef(pollAttemptsLeft);
  attemptsRef.current = pollAttemptsLeft;

  useEffect(() => {
    // A justPurchased render means someone already converted — that's not a
    // fresh "hit the wall" moment, so only log the genuine case.
    if (!justPurchased) void logPaywallShown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!justPurchased) return;
    const interval = setInterval(() => {
      if (attemptsRef.current <= 0) {
        clearInterval(interval);
        return;
      }
      setPollAttemptsLeft((n) => n - 1);
      router.refresh();
    }, CHECKOUT_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justPurchased]);

  function handleReferralSubmit(e: FormEvent) {
    e.preventDefault();
    setReferralError(undefined);
    startReferralTransition(async () => {
      const result = await sendReferralInvite(phone);
      if (!result.ok) {
        setReferralError(result.error);
        return;
      }
      setReferralSent(true);
      setPhone("");
    });
  }

  function handleBuy(kind: "action_pack" | "action_pass") {
    setCheckoutError(undefined);
    setPendingKind(kind);
    startCheckoutTransition(async () => {
      const result = await createCheckoutSession(kind, returnTo);
      if (!result.ok || !result.url) {
        setCheckoutError(result.error ?? "Something went wrong. Try again.");
        return;
      }
      window.location.href = result.url;
    });
  }

  return (
    <div className="space-y-6">
      {justPurchased && (
        <div className="rounded-xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-accent">
          {pollAttemptsLeft > 0
            ? "Payment received — activating your Actions..."
            : "Payment received. If this doesn't update in a moment, refresh the page."}
        </div>
      )}

      <div>
        <h1 className="text-xl font-semibold text-ink">Keep the Action going</h1>
        <p className="mt-1 text-sm text-ink-faint">
          You&apos;ve used your {PRICING.starterFreeActions} free Actions.
        </p>
      </div>

      <Card>
        <CardContent className="pt-5">
          <p className="text-sm font-medium text-ink">Invite a new opponent</p>
          <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-accent">
            Earn {PRICING.referralRewardActions} free Action
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            Bring someone new to {APP_NAME}. When they join and accept their first Action, you get another one
            free.
          </p>

          {referralSent ? (
            <p className="mt-4 text-sm text-accent">Invite sent.</p>
          ) : (
            <form onSubmit={handleReferralSubmit} className="mt-4 space-y-3">
              <div>
                <Label htmlFor="referral-phone">Their phone number</Label>
                <Input
                  id="referral-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="(415) 555-0123"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                {referralError && <p className="mt-2 text-sm text-danger">{referralError}</p>}
              </div>
              <Button
                type="submit"
                variant="secondary"
                className="w-full tap-target"
                isLoading={isReferralPending}
                disabled={!phone.trim()}
              >
                Send invite
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-medium text-ink">{PRICING.actionPack.label}</p>
            <p className="mono-nums text-sm font-semibold text-ink">{PRICING.actionPack.priceDisplay}</p>
          </div>
          <p className="mt-2 text-sm text-ink-muted">{PRICING.actionPack.description}</p>
          {checkoutError && pendingKind === "action_pack" && (
            <p className="mt-2 text-sm text-danger">{checkoutError}</p>
          )}
          {actionPackPurchasable ? (
            <Button
              variant="secondary"
              className="mt-4 w-full tap-target"
              isLoading={isCheckoutPending && pendingKind === "action_pack"}
              disabled={isCheckoutPending}
              onClick={() => handleBuy("action_pack")}
            >
              Buy {PRICING.actionPack.label}
            </Button>
          ) : (
            <Button variant="secondary" className="mt-4 w-full tap-target" disabled>
              Coming soon
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-medium text-ink">{PRICING.actionPass.label}</p>
            <p className="mono-nums text-sm font-semibold text-ink">{PRICING.actionPass.priceDisplay}</p>
          </div>
          <p className="mt-2 text-sm text-ink-muted">{PRICING.actionPass.description}</p>
          <p className="mt-1 text-xs text-ink-faint">{PRICING.actionPass.disclaimer}</p>
          {checkoutError && pendingKind === "action_pass" && (
            <p className="mt-2 text-sm text-danger">{checkoutError}</p>
          )}
          {actionPassPurchasable ? (
            <Button
              className="mt-4 w-full tap-target"
              isLoading={isCheckoutPending && pendingKind === "action_pass"}
              disabled={isCheckoutPending}
              onClick={() => handleBuy("action_pass")}
            >
              Get the Pass
            </Button>
          ) : (
            <Button className="mt-4 w-full tap-target" disabled>
              Coming soon
            </Button>
          )}
        </CardContent>
      </Card>

      {betaCreditsAvailable && (
        <div className="border-t border-border-subtle pt-6">
          <BetaPaywallCredits />
        </div>
      )}

      <p className="text-center text-xs text-ink-faint">Accepting Actions is always free.</p>
    </div>
  );
}
