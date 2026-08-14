import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { HowItWorksGraphic } from "@/components/how-it-works/how-it-works-graphic";
import { APP_NAME } from "@/lib/constants";

export const metadata = {
  title: `How Action Works | ${APP_NAME}`,
  description: "Create an Action, invite your friends, pick a winner, and settle it when the challenge is over.",
  openGraph: {
    title: `How Action Works | ${APP_NAME}`,
    description: "Create an Action, invite your friends, pick a winner, and settle it when the challenge is over.",
    images: [{ url: "/action-og.png", width: 633, height: 343, alt: "Action — Real people. Real challenges. Action." }],
  },
  twitter: {
    card: "summary_large_image",
    title: `How Action Works | ${APP_NAME}`,
    description: "Create an Action, invite your friends, pick a winner, and settle it when the challenge is over.",
    images: ["/action-link-preview.png"],
  },
};

// Public, unauthenticated page — see src/lib/utils/site-gate.ts
// (ALWAYS_PUBLIC_ROUTES) for why this stays reachable even if the
// "coming soon" gate is active. Shares the same graphic and image logic as
// the login page's How It Works modal (components/how-it-works/) rather
// than duplicating it.
export default function HowItWorksPage() {
  return (
    <>
      <AppHeader />
      <PageContainer className="max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{APP_NAME}</p>
        <h1 className="mb-6 mt-1 text-xl font-semibold text-ink">How it works</h1>

        <HowItWorksGraphic priority />

        <div className="mt-8">
          <Link href="/login">
            <Button className="w-full tap-target" size="lg">
              Get started
            </Button>
          </Link>
        </div>
      </PageContainer>
    </>
  );
}
