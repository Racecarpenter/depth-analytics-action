import { parsePhoneNumberFromString } from "libphonenumber-js";

/** Normalizes user input to E.164 (e.g. "+14155551234"). Returns null if invalid. */
export function normalizePhone(raw: string, defaultCountry: "US" = "US"): string | null {
  const parsed = parsePhoneNumberFromString(raw, defaultCountry);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

/** Formats an E.164 number for display, e.g. "+14155551234" -> "(415) 555-1234". */
export function formatPhoneForDisplay(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164);
  return parsed ? parsed.formatNational() : e164;
}

/** Masks a phone number for lightweight privacy in shared UI, e.g. "(•••) •••-1234". */
export function maskPhone(e164: string): string {
  const formatted = formatPhoneForDisplay(e164);
  const last4 = formatted.replace(/\D/g, "").slice(-4);
  return `(•••) •••-${last4}`;
}
