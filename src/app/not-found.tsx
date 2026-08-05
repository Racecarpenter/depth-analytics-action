import Link from "next/link";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-medium text-ink-faint">{APP_NAME}</p>
      <h1 className="mt-2 text-xl font-semibold text-ink">Page not found</h1>
      <p className="mt-1 text-sm text-ink-faint">That link doesn&apos;t lead anywhere.</p>
      <Link href="/" className="mt-6">
        <Button variant="secondary">Back home</Button>
      </Link>
    </div>
  );
}