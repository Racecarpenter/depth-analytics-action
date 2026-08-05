import type { SendSmsInput, SendSmsResult, SmsProvider } from "./types";

/**
 * Development/default provider. Never calls out to the network — it just
 * logs the message (including any invitation link) to the server console so
 * you can develop the full invite flow without a Twilio account.
 */
export class MockSmsProvider implements SmsProvider {
  readonly name = "mock";

  async send(input: SendSmsInput): Promise<SendSmsResult> {
    const banner = "=".repeat(60);
    // eslint-disable-next-line no-console
    console.log(
      `\n${banner}\n[MockSmsProvider] SMS to ${input.to}\n${banner}\n${input.body}\n${banner}\n`,
    );
    return { ok: true, provider: this.name, messageId: `mock_${Date.now()}` };
  }
}
