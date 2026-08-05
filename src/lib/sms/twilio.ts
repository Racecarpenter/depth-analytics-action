import type { SendSmsInput, SendSmsResult, SmsProvider } from "./types";

/**
 * Twilio-backed implementation. Not wired up by default — set
 * SMS_PROVIDER=twilio and the three TWILIO_* env vars to enable it. Uses the
 * plain REST API via fetch so no extra SDK dependency is required.
 */
export class TwilioSmsProvider implements SmsProvider {
  readonly name = "twilio";

  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly fromNumber: string,
  ) {}

  async send(input: SendSmsInput): Promise<SendSmsResult> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const body = new URLSearchParams({
      To: input.to,
      From: this.fromNumber,
      Body: input.body,
    });

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
      throw new Error(`Twilio send failed (${res.status}): ${text}`);
    }

    const json = (await res.json()) as { sid: string };
    return { ok: true, provider: this.name, messageId: json.sid };
  }
}
