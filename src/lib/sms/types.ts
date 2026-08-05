export interface SendSmsInput {
  to: string; // E.164 phone number
  body: string;
}

export interface SendSmsResult {
  ok: boolean;
  provider: string;
  /** Provider-specific message id, when available. */
  messageId?: string;
}

/**
 * Abstraction over "send a text message to a phone number". Swap
 * implementations with SMS_PROVIDER in .env — no call sites change.
 */
export interface SmsProvider {
  readonly name: string;
  send(input: SendSmsInput): Promise<SendSmsResult>;
}
