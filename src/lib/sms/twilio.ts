import { logError } from "@/lib/utils/log-error";
import type { SendSmsInput, SendSmsResult, SmsProvider } from "./types";

/**
 * Twilio-backed implementation. Not wired up by default — set
 * SMS_PROVIDER=twilio and the required TWILIO_* env vars to enable it. Uses
 * the plain REST API via fetch so no extra SDK dependency is required.
 *
 * Sends via a Messaging Service (TWILIO_MESSAGING_SERVICE_SID) when
 * configured, falling back to a bare From number (TWILIO_FROM_NUMBER)
 * otherwise. A Messaging Service is what an A2P 10DLC campaign actually
 * registers against in Twilio, and it's what makes Twilio's own "Advanced
 * Opt-Out" STOP/HELP handling apply automatically — see the "SMS consent &
 * Twilio A2P 10DLC" section in README for the full picture. The From-number
 * fallback stays supported so existing setups without a Messaging Service
 * configured yet don't break.
 *
 * Never throws: every call site in this app treats SMS as best-effort and
 * doesn't check the return value, so a thrown exception here — including
 * Twilio's "unsubscribed recipient" error (21610) when someone has texted
 * STOP — would otherwise crash whatever mutation happened to be sending a
 * message, up to and including login itself (requestOtp sends the OTP code
 * through this same path). Failures are logged and returned, never thrown.
 */
export class TwilioSmsProvider implements SmsProvider {
  readonly name = "twilio";

  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly fromNumber: string,
    private readonly messagingServiceSid?: string,
  ) {}

  async send(input: SendSmsInput): Promise<SendSmsResult> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const params: Record<string, string> = { To: input.to, Body: input.body };
    if (this.messagingServiceSid) {
      params.MessagingServiceSid = this.messagingServiceSid;
    } else {
      params.From = this.fromNumber;
    }
    const body = new URLSearchParams(params);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });

      if (!res.ok) {
        const text = await res.text();
        logError("[TwilioSmsProvider] send failed:", { status: res.status, body: text });
        return { ok: false, provider: this.name, error: `Twilio send failed (${res.status})` };
      }

      const json = (await res.json()) as { sid: string };
      return { ok: true, provider: this.name, messageId: json.sid };
    } catch (err) {
      logError("[TwilioSmsProvider] send threw:", err);
      return { ok: false, provider: this.name, error: "Twilio request failed" };
    }
  }
}
