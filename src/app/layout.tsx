import type { Metadata, Viewport } from "next";
import { QueryProvider } from "@/providers/query-provider";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
