import type { Metadata, Viewport } from "next";
import { QueryProvider } from "@/providers/query-provider";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import { isSiteGatePassed } from "@/lib/utils/site-gate-server";
import { SiteGateScreen } from "@/features/site-gate/components/site-gate-screen";
import "./globals.css";

export const metadata: Metadata = {
  title: `${APP_NAME} — ${APP_TAGLINE}`,
  description: "Challenge a friend on a game. ACTION tracks it — no money, ever.",
};

export const viewport: Viewport = {
  themeColor: "#0a0b0c",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Authoritative site-gate check — see src/lib/utils/site-gate-server.ts.
  // Root layout renders for every request no matter what, so this doesn't
  // depend on middleware.ts/proxy.ts actually running.
  const gatePassed = await isSiteGatePassed();

  return (
    <html lang="en" className="dark">
      <body>
        <QueryProvider>{gatePassed ? children : <SiteGateScreen />}</QueryProvider>
      </body>
    </html>
  );
}