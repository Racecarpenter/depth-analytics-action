/**
 * Supabase's error objects (PostgrestError, AuthError, ...) are class
 * instances whose properties don't reliably survive `console.error`, and
 * especially don't survive Next.js forwarding a Server Component's console
 * output to the browser dev overlay — you'd otherwise see `{}` there even
 * though the real error has a message/code. Pulling the known fields out
 * into a plain object and stringifying makes it show up everywhere: the
 * terminal, the browser console, and error tracking tools alike.
 */
export function logError(label: string, error: unknown) {
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    const plain = {
      // Spread first: picks up every own enumerable property on plain
      // object literals (e.g. TwilioSmsProvider's { status, body }) — the
      // named fields below used to be the *only* thing that survived,
      // silently dropping anything else (like Twilio's actual error body).
      ...e,
      // Named explicitly too, since these specific fields on real
      // Error/PostgrestError/AuthError instances are sometimes
      // non-enumerable prototype getters that a spread alone won't pick up.
      name: e.name,
      message: e.message,
      code: e.code,
      status: e.status,
      details: e.details,
      hint: e.hint,
    };
    console.error(label, JSON.stringify(plain));
  } else {
    console.error(label, error);
  }
}
