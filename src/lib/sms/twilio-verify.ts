import { logError } from "@/lib/utils/log-error";
import type { CheckVerificationResult, StartVerificationResult, VerifyProvider } from "./verify-types";

/**
 * Twilio Verify v2-backed implementation. Not wired up by default — set
 * SMS_PROVIDER=twilio and TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN /
 * TWILIO_VERIFY_SERVICE_SID to enable it. Uses the plain REST API via fetch,
 * same as TwilioSmsProvider — no extra SDK dependency.
 *
 * This is a separate Twilio product from the Messaging Service used
 * elsewhere in the app (invites, results, nudges, reminders — see
 * TwilioSmsProvider): Verify owns code generation, expiry, and
 * attempt-limiting itself, and sends its own message copy — it does not go
 * through TWILIO_MESSAGING_SERVICE_SID or SMS_OPT_OUT_SUFFIX. See README
 * ("How phone auth actually works") for the full picture.
 *
 * Never throws, matching TwilioSmsProvider's contract: requestOtp/verifyOtp
 * treat a failed start/check as a normal, recoverable error to show the
 * user, not a crash.
 */
export class TwilioVerifyProvider implements VerifyProvider {
  readonly name = "twilio";

  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly verifyServiceSid: string,
  ) {}

  private authHeader(): string {
    return `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64")}`;
  }

  async startVerification(phone: string): Promise<StartVerificationResult> {
    const url = `https://verify.twilio.com/v2/Services/${this.verifyServiceSid}/Verifications`;
    const body = new URLSearchParams({ To: phone, Channel: "sms" });

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: this.authHeader(),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });

      if (!res.ok) {
        const text = await res.text();
        logError("[TwilioVerifyProvider] startVerification failed:", { status: res.status, body: text });
        return { ok: false, provider: this.name, error: `Twilio Verify start failed (${res.status})` };
      }

      const json = (await res.json()) as { sid: string };
      return { ok: true, provider: this.name, sid: json.sid };
    } catch (err) {
      logError("[TwilioVerifyProvider] startVerification threw:", err);
      return { ok: false, provider: this.name, error: "Twilio Verify request failed" };
    }
  }

  async checkVerification(phone: string, code: string): Promise<CheckVerificationResult> {
    const url = `https://verify.twilio.com/v2/Services/${this.verifyServiceSid}/VerificationCheck`;
    const body = new URLSearchParams({ To: phone, Code: code });

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: this.authHeader(),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });

      if (!res.ok) {
        // Twilio returns 404 for "no pending verification" (e.g. expired or
        // already-consumed) — treat that the same as a plain wrong/expired
        // code rather than a hard failure, so the user gets the normal
        // "request a new code" message instead of a generic error.
        if (res.status === 404) {
          return { ok: true, provider: this.name, approved: false };
        }
        const text = await res.text();
        logError("[TwilioVerifyProvider] checkVerification failed:", { status: res.status, body: text });
        return { ok: false, provider: this.name, approved: false, error: `Twilio Verify check failed (${res.status})` };
      }

      const json = (await res.json()) as { status: string };
      return { ok: true, provider: this.name, approved: json.status === "approved" };
    } catch (err) {
      logError("[TwilioVerifyProvider] checkVerification threw:", err);
      return { ok: false, provider: this.name, approved: false, error: "Twilio Verify request failed" };
    }
  }
}
