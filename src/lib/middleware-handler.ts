import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ALWAYS_PUBLIC_ROUTES, isValidGateToken, SITE_GATE_COOKIE } from "@/lib/utils/site-gate";

interface CookieToSet {
  name: string;
  value: string;
  options: CookieOptions;
}

// Routes that don't require an authenticated session. Everything else
// redirects to /login. The invite acceptance page handles its own
// unauthenticated view (a person can review an Action before they sign in).
// /coming-soon is here too since it has to render before anyone's signed in.
// /privacy and /terms must always be reachable logged-out — Twilio's A2P
// 10DLC campaign review process visits both directly. (ALWAYS_PUBLIC_ROUTES,
// which this list includes, also drives the coming-soon gate exemption below
// and the root layout's gate check — see src/lib/utils/site-gate.ts.)
const PUBLIC_ROUTES = ["/login", "/coming-soon", ...ALWAYS_PUBLIC_ROUTES];
const PUBLIC_PREFIXES = ["/invite/"];

function isPublicRoute(pathname: string) {
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Site-wide "coming soon" password gate, independent of Supabase auth.
 * Only active when both SITE_PASSWORD and SITE_GATE_SECRET are set — unset
 * either in Vercel (and redeploy) to open the site back up. See
 * src/lib/utils/site-gate.ts for the token format.
 */
async function checkSiteGate(request: NextRequest): Promise<NextResponse | null> {
  const secret = process.env.SITE_GATE_SECRET;
  const password = process.env.SITE_PASSWORD;
  const { pathname } = request.nextUrl;

  // TEMPORARY — remove once the gate is confirmed working. Logs to Vercel's
  // Runtime Logs (Observability tab) on every request this code path runs.
  console.log("[site-gate]", {
    pathname,
    secretSet: Boolean(secret),
    passwordSet: Boolean(password),
    hasCookie: Boolean(request.cookies.get(SITE_GATE_COOKIE)?.value),
  });

  if (!secret || !password) return null;
  if (pathname === "/coming-soon") return null;
  if (pathname.startsWith("/api/")) return null;
  if (ALWAYS_PUBLIC_ROUTES.includes(pathname)) return null;

  const token = request.cookies.get(SITE_GATE_COOKIE)?.value;
  const valid = await isValidGateToken(token, secret);
  console.log("[site-gate] tokenValid:", valid);
  if (valid) return null;

  const gateUrl = new URL("/coming-soon", request.url);
  gateUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(gateUrl);
}

/**
 * Shared entry point for both middleware.ts (Next.js <= 15) and proxy.ts
 * (Next.js >= 16, which renamed the file convention — a leftover
 * middleware.ts is silently ignored on 16+, no build error, so this logic
 * has to be reachable from both entry points during the transition).
 */
export async function handleRequest(request: NextRequest): Promise<NextResponse> {
  console.log('goofy ass bullshit')
  const gateRedirect = await checkSiteGate(request);
  if (gateRedirect) return gateRedirect;

  // Forwarded so the root layout's own, more-authoritative gate check
  // (src/app/layout.tsx / site-gate-server.ts) can also exempt
  // ALWAYS_PUBLIC_ROUTES without depending on this middleware having run —
  // if this header is ever absent there, that check just falls back to its
  // existing (pre-this-change) behavior, not a security regression.
  request.headers.set("x-pathname", request.nextUrl.pathname);

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicRoute(pathname) && !pathname.startsWith("/_next") && !pathname.startsWith("/api")) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}