import "server-only";
import { MockSmsProvider } from "./mock";
import { TwilioSmsProvider } from "./twilio";
import type { SmsProvider } from "./types";

export type { SendSmsInput, SendSmsResult, SmsProvider } from "./types";

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
