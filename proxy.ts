// Next.js 16+ entry point (Next.js renamed the middleware.ts convention to
// proxy.ts in 16.0.0 — a leftover middleware.ts is silently ignored on 16+
// with no build error). middleware.ts still exists alongside this for
// Next.js <= 15; both share the same logic from src/lib/middleware-handler.ts.
import type { NextRequest } from "next/server";
import { handleRequest } from "@/lib/middleware-handler";

export async function proxy(request: NextRequest) {
  return handleRequest(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - static files, images, favicon
     * - the settlement cron API route (auth'd separately via CRON_SECRET)
     */
    "/((?!_next/static|_next/image|favicon.ico|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};