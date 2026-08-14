export interface StartVerificationResult {
  ok: boolean;
  provider: string;
  /** Provider-specific verification id/sid, when available. */
  sid?: string;
  /** Present when ok is false. See VerifyProvider for the never-throw contract. */
  error?: string;
}

export interface CheckVerificationResult {
  ok: boolean;
  provider: string;
  /**
   * True only when the provider confirms the submitted code was correct
   * (Twilio Verify's `status === "approved"`). `ok` can be true with
   * `approved: false` — that's a successful check call that simply rejected
   * a wrong/expired code, as opposed to `ok: false`, which means the check
   * call itself failed (network error, bad service config, etc).
   */
  approved: boolean;
  error?: string;
}

/**
 * Abstraction over Twilio Verify's "start a verification" / "check a
 * submitted code" protocol. Deliberately separate from SmsProvider
 * (src/lib/sms/types.ts): Verify doesn't take a message body — Twilio
 * generates, expires, and rate-limits the code itself — so it doesn't fit
 * the "send this exact text" shape the rest of the app's SMS sending uses.
 * Swap implementations with SMS_PROVIDER in .env, same as SmsProvider — no
 * call sites change.
 */
export interface VerifyProvider {
  readonly name: string;
  startVerification(phone: string): Promise<StartVerificationResult>;
  checkVerification(phone: string, code: string): Promise<CheckVerificationResult>;
}
