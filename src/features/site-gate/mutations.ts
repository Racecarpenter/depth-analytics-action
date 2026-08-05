"use server";

import { cookies } from "next/headers";
import { createGateToken, SITE_GATE_COOKIE, timingSafeEqual } from "@/lib/utils/site-gate";

export interface SiteGateResult {
  ok: boolean;
  error?: string;
}

export async function unlockSiteGate(password: string): Promise<SiteGateResult> {
  const expected = process.env.SITE_PASSWORD;
  const secret = process.env.SITE_GATE_SECRET;

  if (!expected || !secret) {
    return { ok: false, error: "The site gate isn't configured — set SITE_PASSWORD and SITE_GATE_SECRET." };
  }

  if (!timingSafeEqual(password, expected)) {
    return { ok: false, error: "Wrong password." };
  }

  const token = await createGateToken(secret);
  const store = await cookies();
  store.set(SITE_GATE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return { ok: true };
}