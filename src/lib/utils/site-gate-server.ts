import "server-only";
import { cookies } from "next/headers";
import { isValidGateToken, SITE_GATE_COOKIE } from "./site-gate";

/**
 * Authoritative gate check, called directly from the root layout instead of
 * relying solely on middleware.ts/proxy.ts. Root layout always renders for
 * every request regardless of Next.js version or which of those two files
 * (if either) actually executes — that ambiguity is exactly what made the
 * middleware-only version unreliable to debug, so this doesn't depend on it.
 *
 * Deliberately a separate file from site-gate.ts: this one imports
 * next/headers, which is only valid in a Server Component / Route Handler
 * context, not in middleware's Edge runtime — keeping it out of site-gate.ts
 * keeps that file safe to import from middleware-handler.ts too.
 */
export async function isSiteGatePassed(): Promise<boolean> {
  const secret = process.env.SITE_GATE_SECRET;
  const password = process.env.SITE_PASSWORD;
  if (!secret || !password) return true; // gate disabled entirely when unset

  const store = await cookies();
  const token = store.get(SITE_GATE_COOKIE)?.value;
  return isValidGateToken(token, secret);
}