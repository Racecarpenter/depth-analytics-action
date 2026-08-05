import { SiteGateForm } from "@/features/site-gate/components/site-gate-form";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";

/** Only reachable when the middleware gate redirects here — see middleware.ts. */
export default async function ComingSoonPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") ? next : "/";

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6 text-center">
      <div>
        <p className="text-2xl font-semibold text-ink">{APP_NAME}</p>
        <p className="text-sm text-ink-faint">{APP_TAGLINE}</p>
      </div>
      <p className="max-w-sm text-sm text-ink-muted">
        Still in development — not open yet. Check back soon.
      </p>
      <SiteGateForm next={safeNext} />
    </div>
  );
}