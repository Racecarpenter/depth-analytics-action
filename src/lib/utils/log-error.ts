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
