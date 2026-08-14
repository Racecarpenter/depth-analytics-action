import type { Metadata, Viewport } from "next";
import { QueryProvider } from "@/providers/query-provider";
import { APP_NAME } from "@/lib/constants";
import { isSiteGatePassed } from "@/lib/utils/site-gate-server";
import { SiteGateScreen } from "@/features/site-gate/components/site-gate-screen";
import "./globals.css";

const SITE_URL = "https://da-action.com";
const TITLE = "Action — Make it real.";
const DESCRIPTION = "Challenge your friends. Pick who wins, set the stakes, and make it real.";

// No title.template here on purpose — Terms/Privacy/How It Works each set
// their own plain-string title (e.g. "Privacy Policy — ACTION"), and a
// template would concatenate "Action" onto those a second time. Route
// segments below are free to override any of this per-page.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: APP_NAME,
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    url: SITE_URL,
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: "/action-og.png",
        width: 633,
        height: 343,
        alt: "Action — Real people. Real challenges. Action.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/action-link-preview.png"],
  },
  icons: {
    icon: "/action-icon.png",
    apple: "/action-icon.png",
  },
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