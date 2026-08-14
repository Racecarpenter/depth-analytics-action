import crypto from "node:crypto";
import type { CheckVerificationResult, StartVerificationResult, VerifyProvider } from "./verify-types";

const CODE_EXPIRY_MINUTES = 10;

/**
 * Development/default provider. Mirrors MockSmsProvider: never calls out to
 * the network, just logs the code to the server console so you can develop
 * the entire login flow without a Twilio account. Twilio Verify owns code
 * generation/expiry in production, so this keeps its own tiny in-memory
 * store to reproduce that behavior locally — it's intentionally not
 * persisted anywhere, so codes don't survive a server restart.
 */
export class MockVerifyProvider implements VerifyProvider {
  readonly name = "mock";
  private codes = new Map<string, { code: string; expiresAt: number }>();

  async startVerification(phone: string): Promise<StartVerificationResult> {
    const code = crypto.randomInt(100000, 1000000).toString();
    this.codes.set(phone, { code, expiresAt: Date.now() + CODE_EXPIRY_MINUTES * 60_000 });

    const banner = "=".repeat(60);
    // eslint-disable-next-line no-console
    console.log(
      `\n${banner}\n[MockVerifyProvider] Verification code for ${phone}\n${banner}\n${code}\n${banner}\n`,
    );

    return { ok: true, provider: this.name, sid: `mock_verify_${Date.now()}` };
  }

  async checkVerification(phone: string, code: string): Promise<CheckVerificationResult> {
    const entry = this.codes.get(phone);
    if (!entry) return { ok: true, provider: this.name, approved: false };

    if (Date.now() > entry.expiresAt) {
      this.codes.delete(phone);
      return { ok: true, provider: this.name, approved: false };
    }

    const approved = entry.code === code;
    if (approved) this.codes.delete(phone);
    return { ok: true, provider: this.name, approved };
  }
}
