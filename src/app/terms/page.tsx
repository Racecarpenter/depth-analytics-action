import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { APP_NAME, SUPPORT_EMAIL } from "@/lib/constants";

export const metadata = {
  title: `Terms of Service — ${APP_NAME}`,
};

// Public, unauthenticated page — required reachable while logged out (Twilio
// A2P 10DLC review, App/Play store review, general users). See
// src/lib/utils/site-gate.ts (ALWAYS_PUBLIC_ROUTES) for how this stays
// reachable even if the "coming soon" gate is active.
export default function TermsPage() {
  return (
    <>
      <AppHeader />
      <PageContainer className="max-w-2xl">
        <h1 className="mb-1 text-xl font-semibold text-ink">Terms of Service</h1>
        <p className="mb-8 text-sm text-ink-faint">Last updated August 13, 2026</p>

        <div className="space-y-8 text-sm leading-relaxed text-ink-muted">
          <section>
            <p>
              These Terms of Service (&ldquo;Terms&rdquo;) govern your use of {APP_NAME},
              a service by Depth Analytics. By creating an account or using {APP_NAME}, you
              agree to these Terms. If you don&rsquo;t agree, don&rsquo;t use the service.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink">Eligibility</h2>
            <p>
              You must be at least 18 years old to create an Action that involves a
              monetary stake, and at least 13 years old to use {APP_NAME} at all. Some
              Actions involve money-adjacent terms between participants, so we take
              eligibility seriously — do not create or accept a monetary Action if you are
              under 18.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink">
              What {APP_NAME} is (and isn&rsquo;t)
            </h2>
            <p>
              {APP_NAME} is software that helps you track challenges, wagers, and
              agreements between yourself and other participants you invite. {APP_NAME} is
              not a participant in any Action, does not set odds, does not accept bets, and
              is not a party to any agreement you make with another participant.
            </p>
            <p className="mt-3">
              {APP_NAME} is not a sportsbook, bookmaker, or money transmitter. We do not
              accept wagers, hold funds, escrow funds, transfer funds between users,
              collect losses, or pay out winnings. Any stake described in an Action is an
              informal agreement between the participants themselves. Settlement features
              in the app (marking a stake paid, confirming receipt, disputing) are
              record-keeping only, reflecting what users report to each other — {APP_NAME}{" "}
              never moves money on anyone&rsquo;s behalf.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink">Your responsibility</h2>
            <p>
              Laws about informal wagers between individuals vary by location, and we
              can&rsquo;t tell you whether a specific Action is legal where you live. You
              are solely responsible for determining whether creating or accepting an
              Action is legal in your jurisdiction, and for complying with applicable law.
              We do not represent or guarantee that any Action is lawful.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink">Custom Actions</h2>
            <p>
              Custom Actions are resolved by unanimous consensus of the participants
              voting on the outcome. {APP_NAME} does not independently verify, adjudicate,
              or referee the outcome of a Custom Action. If participants cannot agree, the
              Action may remain unresolved — {APP_NAME} does not decide disputes for you.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink">Sports Actions</h2>
            <p>
              Sports Actions rely on game and result data from third-party sports data
              providers. That data may be delayed, incomplete, or occasionally incorrect.
              {" "}{APP_NAME} is not responsible for errors originating from third-party
              data providers, though we&rsquo;ll make reasonable efforts to correct known
              issues.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink">Settlement is not debt collection</h2>
            <p>
              The settlement feature lets participants record that a stake was marked
              paid, confirmed, or disputed. This is a reporting tool only.{" "}
              {APP_NAME} is not a debt collector, does not guarantee that any participant
              will actually pay another, and does not enforce payment in any way. Disputes
              between participants about whether a stake was actually paid are not
              guaranteed to be resolved by {APP_NAME}, and we do not arbitrate them.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink">Acceptable use</h2>
            <p className="mb-3">You agree not to use {APP_NAME} to:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Engage in illegal activity, including unlawful wagering in your jurisdiction.</li>
              <li>Harass, threaten, or abuse another user.</li>
              <li>Commit fraud or impersonate another person.</li>
              <li>Abuse the SMS or invitation system (spam, unsolicited invitations to non-consenting numbers, etc.).</li>
              <li>Manipulate Action results, votes, or settlement status dishonestly.</li>
            </ul>
            <p className="mt-3">
              We may suspend or terminate accounts that violate these Terms.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink">SMS terms</h2>
            <p>
              By providing your phone number, you consent to receive transactional SMS
              from {APP_NAME}, including account verification codes, Action invitations,
              acceptance and status updates, results, and settlement reminders. These
              messages are transactional, not marketing. Message frequency varies. Message
              and data rates may apply from your carrier. Reply <strong className="text-ink">STOP</strong>{" "}
              to opt out at any time, or <strong className="text-ink">HELP</strong> for
              help. Carriers are not liable for delayed or undelivered messages. Consent to
              receive SMS is not a condition of any purchase.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink">Action Packs &amp; Action Pass</h2>
            <p>
              Action Packs and the 30-Day Action Pass are one-time purchases of software
              access — they increase the number of Actions you can create, or grant
              unlimited creation for a period of time. They are not gambling currency, are
              not redeemable for cash, and cannot be transferred to another user. They have
              no relationship to the outcome of any Action or any stake between
              participants.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink">Liability &amp; warranties</h2>
            <p>
              {APP_NAME} is provided &ldquo;as is&rdquo; without warranties of any kind,
              express or implied. To the maximum extent permitted by law, Depth Analytics
              is not liable for any indirect, incidental, or consequential damages arising
              from your use of the service, including disputes between participants over
              Actions or stakes.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink">Changes &amp; termination</h2>
            <p>
              We may update these Terms from time to time; continued use of {APP_NAME}{" "}
              after a change means you accept the updated Terms. We may suspend or
              terminate your access to {APP_NAME} at any time for violation of these
              Terms.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink">Contact us</h2>
            <p>
              Questions about these Terms? Email us at{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="underline underline-offset-2 hover:text-ink">
                {SUPPORT_EMAIL}
              </a>
              .
            </p>
          </section>
        </div>
      </PageContainer>
    </>
  );
}
