import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { Card, CardContent } from "@/components/ui/card";
import { APP_NAME, SUPPORT_EMAIL } from "@/lib/constants";

export const metadata = {
  title: `Privacy Policy — ${APP_NAME}`,
};

// Public, unauthenticated page — required reachable while logged out (Twilio
// A2P 10DLC review, App/Play store review, general users). See
// src/lib/utils/site-gate.ts (ALWAYS_PUBLIC_ROUTES) for how this stays
// reachable even if the "coming soon" gate is active.
export default function PrivacyPage() {
  return (
    <>
      <AppHeader />
      <PageContainer className="max-w-2xl">
        <h1 className="mb-1 text-xl font-semibold text-ink">Privacy Policy</h1>
        <p className="mb-8 text-sm text-ink-faint">Last updated August 13, 2026</p>

        <div className="space-y-8 text-sm leading-relaxed text-ink-muted">
          <section>
            <p>
              {APP_NAME} (&ldquo;{APP_NAME},&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;) is a
              service by Depth Analytics that helps people track challenges, wagers, and
              agreements between friends. This policy explains what information we
              collect, how we use it, and the choices you have. {APP_NAME} is software for
              tracking agreements between participants — it never collects, holds,
              processes, transfers, or escrows the money participants owe each other. See
              &ldquo;Software purchases vs. participant stakes&rdquo; below for the one
              place actual payment does occur.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink">Information we collect</h2>
            <p className="mb-3">We collect the following categories of information:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <span className="text-ink">Phone number.</span> Used to create your account,
                sign you in, and send transactional SMS (see &ldquo;SMS messaging&rdquo;
                below).
              </li>
              <li>
                <span className="text-ink">Account and profile information.</span> Your
                display name and any other profile details you choose to provide.
              </li>
              <li>
                <span className="text-ink">Action data.</span> The Actions (challenges,
                bets, or agreements) you create or are invited to, including titles,
                terms, and stake descriptions.
              </li>
              <li>
                <span className="text-ink">Participant relationships.</span> Who you&rsquo;ve
                challenged, who&rsquo;s invited you, and your role (creator, participant,
                winner, loser) in each Action.
              </li>
              <li>
                <span className="text-ink">Challenge terms and stakes.</span> The
                conditions and stake amounts participants agree to when creating an
                Action.
              </li>
              <li>
                <span className="text-ink">Results and settlement status.</span> Outcomes
                of Sports Actions, votes on Custom Actions, and who has marked a stake as
                paid, confirmed, or disputed.
              </li>
              <li>
                <span className="text-ink">Custom Action votes.</span> The outcome each
                participant votes for when resolving a Custom Action.
              </li>
              <li>
                <span className="text-ink">Optional proof images.</span> Photos you choose
                to upload as evidence when resolving a Custom Action.
              </li>
              <li>
                <span className="text-ink">Device and technical information.</span>
                Standard web request data such as IP address, browser type, and usage logs,
                used for security and troubleshooting.
              </li>
              <li>
                <span className="text-ink">Payment information (software purchases only).</span>{" "}
                If you purchase an Action Pack or Action Pass, our payment processor
                (Stripe) collects your payment card details directly — we never see or
                store your full card number. See &ldquo;Stripe&rdquo; below.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink">Stripe</h2>
            <p>
              Software purchases (Action Packs and Action Passes) are processed by Stripe,
              our third-party payment processor. When you make a purchase, Stripe collects
              your payment details directly on their secure infrastructure — {APP_NAME}{" "}
              does not receive or store your full card number. We receive confirmation
              that a payment succeeded and the amount, which we use to grant the
              corresponding Action credits or Pass access to your account. Stripe&rsquo;s
              use of your information is governed by{" "}
              <a
                href="https://stripe.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-ink"
              >
                Stripe&rsquo;s own privacy policy
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink">
              Software purchases vs. participant stakes
            </h2>
            <p>
              It&rsquo;s important to understand the difference between two things that can
              look similar but are not: money you pay {APP_NAME} for software access, and
              stakes you agree to with other participants inside an Action.
            </p>
            <p className="mt-3">
              Action Packs and the Action Pass are purchases of software access — they
              unlock the ability to create more Actions. That money goes to Depth
              Analytics, processed by Stripe, like any other software subscription or
              in-app purchase.
            </p>
            <p className="mt-3">
              The stakes participants agree to inside an Action (for example, &ldquo;loser
              buys dinner&rdquo; or &ldquo;$20&rdquo;) are informational only.{" "}
              {APP_NAME} does not collect, hold, process, transfer, or escrow that money in
              any way. Settlement between participants (marking a stake as paid, confirming
              receipt, disputing) is a record-keeping feature only — {APP_NAME} is not a
              party to, guarantor of, or payment processor for those arrangements.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink">SMS messaging</h2>
            <p>
              If you provide a phone number, {APP_NAME} sends transactional text messages
              related to account verification, Action invitations, acceptance and status
              updates, results, and settlement reminders. Message frequency varies based on
              your activity. Message and data rates may apply from your carrier.
            </p>
            <p className="mt-3">
              You can opt out of SMS at any time by replying <strong className="text-ink">STOP</strong>{" "}
              to any message. Reply <strong className="text-ink">HELP</strong> for help. Consent
              to receive SMS is not a condition of purchasing anything from {APP_NAME}.
            </p>
          </section>

          <Card>
            <CardContent className="pt-5">
              <h2 className="mb-2 text-base font-semibold text-ink">
                Mobile number non-sharing
              </h2>
              <p>
                Mobile information will not be sold, rented, or shared with third parties
                for their marketing or promotional purposes. SMS opt-in data and consent
                will not be shared with third parties or affiliates for marketing or
                promotional purposes.
              </p>
            </CardContent>
          </Card>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink">Service providers</h2>
            <p className="mb-3">
              We share information with a small number of vendors who help us operate{" "}
              {APP_NAME}, strictly to provide the service — never to sell your data or your
              SMS consent for their own marketing:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <span className="text-ink">Hosting and infrastructure</span> — to run the
                application.
              </li>
              <li>
                <span className="text-ink">Database (Supabase)</span> — to store your
                account and Action data securely.
              </li>
              <li>
                <span className="text-ink">SMS delivery (Twilio)</span> — to deliver the
                text messages described above. Twilio processes your phone number and
                message content solely to transmit messages on our behalf.
              </li>
              <li>
                <span className="text-ink">Payments (Stripe)</span> — to process software
                purchases, as described above.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink">Data retention</h2>
            <p>
              We retain account and Action data for as long as your account is active, and
              for a reasonable period afterward to comply with legal obligations, resolve
              disputes, and maintain the integrity of Action history for other
              participants (since an Action typically involves more than one person).
              Consent and audit records (such as SMS consent events) are retained to
              demonstrate compliance with messaging regulations.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink">Security</h2>
            <p>
              We use reasonable technical and organizational measures to protect your
              information, including encryption in transit and access controls on our
              database. No method of transmission or storage is completely secure, and we
              cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink">Your rights</h2>
            <p>
              You can access or update most of your account information directly in the
              app. To request access to, correction of, or deletion of your data, contact
              us using the information below. We&rsquo;ll respond within a reasonable
              time, subject to our legitimate need to retain certain records (for example,
              Action history involving other participants, or consent records required by
              law).
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink">Contact us</h2>
            <p>
              Questions about this policy or your data? Email us at{" "}
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
