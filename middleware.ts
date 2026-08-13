// Next.js <= 15 entry point. Next.js 16+ uses proxy.ts instead (see that
// file) — a leftover middleware.ts is silently ignored on 16+ with no build
// error, so both files exist side by side and share the same logic from
// src/lib/middleware-handler.ts until this project is fully off 15.x.
import type { NextRequest } from "next/server";
import { handleRequest } from "@/lib/middleware-handler";

export async function middleware(request: NextRequest) {
  console.log('da fuq')
  return handleRequest(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - static files, images, favicon
     * - the settlement cron API route (auth'd separately via CRON_SECRET)
     * - the Stripe webhook route (auth'd separately via signature
     *   verification — Stripe can't complete a login or a coming-soon
     *   password gate, so it must never be redirected)
     */
    "/((?!_next/static|_next/image|favicon.ico|api/cron|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};