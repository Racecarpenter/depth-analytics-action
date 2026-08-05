/**
 * Site-wide "coming soon" password gate. Independent of Supabase auth —
 * this exists purely to keep random visitors to a live domain out of an
 * app that isn't ready yet. Gate is only active when both SITE_PASSWORD and
 * SITE_GATE_SECRET are set; unset either (in Vercel) and redeploy to open
 * the site back up without touching code.
 *
 * Deliberately built on Web Crypto (`crypto.subtle`) instead of node:crypto
 * (see features/actions/lib/signed-token.ts for that pattern) because this
 * runs inside middleware, which executes on the Edge runtime by default and
 * doesn't have node:crypto available.
 */

export const SITE_GATE_COOKIE = "action_gate";
const GATE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function toBase64Url(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Not a timing leak in practice for a single shared low-stakes password, but cheap to do right. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function hmacSha256(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return toBase64Url(sig);
}

/** Builds a signed, expiring cookie value proving the visitor entered the right password. */
export async function createGateToken(secret: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + GATE_TTL_SECONDS;
  const payload = `granted.${exp}`;
  return `${payload}.${await hmacSha256(secret, payload)}`;
}

/** Verifies signature + expiry. Can't be forged without SITE_GATE_SECRET. */
export async function isValidGateToken(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [marker, expStr, sig] = parts;
  if (marker !== "granted") return false;

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;

  const expectedSig = await hmacSha256(secret, `${marker}.${expStr}`);
  return timingSafeEqual(sig, expectedSig);
}