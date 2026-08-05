import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isValidGateToken, SITE_GATE_COOKIE } from "@/lib/utils/site-gate";

interface CookieToSet {
  name: string;
  value: string;
  options: CookieOptions;
}

// Routes that don't require an authenticated session. Everything else
// redirects to /login. The invite acceptance page handles its own
// unauthenticated view (a person can review an Action before they sign in).
// /coming-soon is here too since it has to render before anyone's signed in.
const PUBLIC_ROUTES = ["/login", "/coming-soon"];
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
  if (!secret || !password) return null;

  const { pathname } = request.nextUrl;
  if (pathname === "/coming-soon") return null;

  const token = request.cookies.get(SITE_GATE_COOKIE)?.value;
  if (await isValidGateToken(token, secret)) return null;

  const gateUrl = new URL("/coming-soon", request.url);
  gateUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(gateUrl);
}

export async function middleware(request: NextRequest) {
  const gateRedirect = await checkSiteGate(request);
  if (gateRedirect) return gateRedirect;

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