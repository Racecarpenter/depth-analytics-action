import "server-only";
import { MockSmsProvider } from "./mock";
import { TwilioSmsProvider } from "./twilio";
import { MockVerifyProvider } from "./mock-verify";
import { TwilioVerifyProvider } from "./twilio-verify";
import type { SmsProvider } from "./types";
import type { VerifyProvider } from "./verify-types";

export type { SendSmsInput, SendSmsResult, SmsProvider } from "./types";
export type { StartVerificationResult, CheckVerificationResult, VerifyProvider } from "./verify-types";

let cached: SmsProvider | null = null;

/** Factory — reads SMS_PROVIDER and returns the matching implementation. */
export function getSmsProvider(): SmsProvider {
  if (cached) return cached;

  const provider = (process.env.SMS_PROVIDER ?? "mock").toLowerCase();

  switch (provider) {
    case "twilio": {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const token = process.env.TWILIO_AUTH_TOKEN;
      const from = process.env.TWILIO_FROM_NUMBER;
      const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID || undefined;
      if (!sid || !token || (!from && !messagingServiceSid)) {
        throw new Error(
          "SMS_PROVIDER=twilio requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and either TWILIO_MESSAGING_SERVICE_SID (preferred — required for A2P 10DLC campaign traffic) or TWILIO_FROM_NUMBER.",
        );
      }
      cached = new TwilioSmsProvider(sid, token, from ?? "", messagingServiceSid);
      return cached;
    }
    case "mock":
    default:
      cached = new MockSmsProvider();
      return cached;
  }
}

let cachedVerify: VerifyProvider | null = null;

/**
 * Factory — reads the same SMS_PROVIDER env var as getSmsProvider() (not a
 * separate toggle: "mock" or "twilio" should mean the same thing for both
 * the transactional-SMS path and the login-OTP path) and returns the
 * matching Twilio Verify implementation. Used only by requestOtp/verifyOtp
 * (src/features/auth/mutations.ts) — every other SMS send in the app
 * continues to go through getSmsProvider()/TWILIO_MESSAGING_SERVICE_SID,
 * untouched by this.
 */
export function getVerifyProvider(): VerifyProvider {
  if (cachedVerify) return cachedVerify;

  const provider = (process.env.SMS_PROVIDER ?? "mock").toLowerCase();

  switch (provider) {
    case "twilio": {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const token = process.env.TWILIO_AUTH_TOKEN;
      const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
      if (!sid || !token || !verifyServiceSid) {
        throw new Error(
          "SMS_PROVIDER=twilio requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_VERIFY_SERVICE_SID (Twilio Console → Verify → Services) for the login-OTP flow.",
        );
      }
      cachedVerify = new TwilioVerifyProvider(sid, token, verifyServiceSid);
      return cachedVerify;
    }
    case "mock":
    default:
      cachedVerify = new MockVerifyProvider();
      return cachedVerify;
  }
}
