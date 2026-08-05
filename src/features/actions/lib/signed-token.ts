import "server-only";
import crypto from "node:crypto";
import { INVITE_EXPIRY_HOURS } from "@/lib/constants";

export interface InviteTokenPayload {
  actionId: string;
  participantId: string;
  exp: number; // unix seconds
}

function sign(payload: string): string {
  const secret = process.env.INVITE_TOKEN_SECRET;
  if (!secret) throw new Error("INVITE_TOKEN_SECRET is not set.");
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

/** Builds a self-verifying, expiring, HMAC-signed invite token. */
export function createInviteToken(actionId: string, participantId: string): string {
  const payload: InviteTokenPayload = {
    actionId,
    participantId,
    exp: Math.floor(Date.now() / 1000) + INVITE_EXPIRY_HOURS * 60 * 60,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

/** Verifies signature + expiry. Returns the decoded payload, or null if invalid/expired. */
export function verifyInviteToken(token: string): InviteTokenPayload | null {
  const [encoded, sig] = token.split(".");
  if (!encoded || !sig) return null;

  let expectedSig: string;
  try {
    expectedSig = sign(encoded);
  } catch {
    return null;
  }

  const provided = Buffer.from(sig);
  const expected = Buffer.from(expectedSig);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString()) as InviteTokenPayload;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function inviteUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/invite/${token}`;
}
