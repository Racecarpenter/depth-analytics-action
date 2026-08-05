import { AuthFlow } from "@/features/auth/components/auth-flow";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{APP_NAME}</h1>
          <p className="mt-1 text-sm text-ink-faint">{APP_TAGLINE}</p>
        </div>
        <AuthFlow redirectTo={next && next.startsWith("/") ? next : "/"} />
        <p className="mt-8 text-center text-xs leading-relaxed text-ink-faint">
          ACTION tracks challenges between friends. It never collects, holds, or
          transfers money.
        </p>
      </div>
    </div>
  );
}
