import { SiteGateScreen } from "@/features/site-gate/components/site-gate-screen";

/**
 * Enforcement now happens in the root layout (src/app/layout.tsx), which
 * shows this same screen in place of any page when the gate isn't
 * unlocked — so this route isn't required for the gate to work, it just
 * gives you a stable direct URL if you want one (e.g. to link people to
 * before the site opens).
 */
export default function ComingSoonPage() {
  return <SiteGateScreen />;
}