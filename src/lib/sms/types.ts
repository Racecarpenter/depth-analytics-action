export interface SendSmsInput {
  to: string; // E.164 phone number
  body: string;
}

export interface SendSmsResult {
  ok: boolean;
  provider: string;
  /** Provider-specific message id, when available. */
  messageId?: string;
  /**
   * Present when ok is false. Every implementation must fail soft (return
   * this, never throw) — every call site in this codebase already treats
   * SMS as fire-and-forget, so an implementation that throws instead turns
   * one undeliverable message (e.g. Twilio refusing to send to a number
   * that's texted STOP) into an unhandled exception that crashes the whole
   * calling mutation, including OTP delivery during login.
   */
  error?: string;
}

/**
 * Abstraction over "send a text message to a phone number". Swap
 * implementations with SMS_PROVIDER in .env — no call sites change.
 */
export interface SmsProvider {
  readonly name: string;
  send(input: SendSmsInput): Promise<SendSmsResult>;
}
