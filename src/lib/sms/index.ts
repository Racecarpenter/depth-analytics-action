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
      if (!sid || !token || !from) {
        throw new Error(
          "SMS_PROVIDER=twilio requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER.",
        );
      }
      cached = new TwilioSmsProvider(sid, token, from);
      return cached;
    }
    case "mock":
    default:
      cached = new MockSmsProvider();
      return cached;
  }
}
