import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { resolveIdentity, type IdentitySource } from "@/features/users/lib/identity";

/**
 * The one component every screen uses to render "who is this participant" —
 * see lib/identity.ts for the resolution rule. Server-renderable (no hooks),
 * so it composes into both server pages and client components. Wrap in an
 * `href` to make it tappable through to /players/[userId] (only passed by
 * callers that already know a lightweight profile is reachable there).
 */
export function ParticipantIdentity({
  source,
  phone,
  href,
  size = "md",
  subtext,
  className,
}: {
  source: IdentitySource | null | undefined;
  phone: string;
  href?: string;
  size?: "sm" | "md" | "lg";
  /** Optional line under the name, e.g. "12 Actions together". Ignored when handle is present (handle takes that slot). */
  subtext?: string;
  className?: string;
}) {
  const identity = resolveIdentity(source, phone);

  const content = (
    <div className={className ? className : "flex items-center gap-3"}>
      <Avatar url={identity.avatarUrl} label={identity.name} size={size} />
      <div className="min-w-0">
        <div className="truncate font-medium text-ink">{identity.name}</div>
        {identity.handle ? (
          <div className="truncate text-xs text-ink-muted">{identity.handle}</div>
        ) : subtext ? (
          <div className="truncate text-xs text-ink-muted">{subtext}</div>
        ) : null}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent">
        {content}
      </Link>
    );
  }

  return content;
}
