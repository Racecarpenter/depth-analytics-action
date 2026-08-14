import Image from "next/image";
import { cn } from "@/lib/utils/cn";

const SIZE_CLASSES = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-xl",
} as const;

const SIZE_PX = { sm: 32, md: 40, lg: 64 } as const;

/**
 * Photo when there's a URL, otherwise a plain initial-letter circle —
 * terminal-aesthetic, not a gradient placeholder. `label` is used only to
 * derive the initial and for the alt text; never rendered as visible text
 * when a photo is present.
 */
export function Avatar({
  url,
  label,
  size = "md",
  className,
}: {
  url: string | null;
  label: string;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}) {
  const dims = SIZE_CLASSES[size];

  if (url) {
    return (
      <Image
        src={url}
        alt=""
        width={SIZE_PX[size]}
        height={SIZE_PX[size]}
        className={cn("shrink-0 rounded-full border border-border-subtle object-cover", dims, className)}
        unoptimized
      />
    );
  }

  const initial = label.trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border border-border-subtle bg-bg-raised font-medium text-ink-muted",
        dims,
        className,
      )}
    >
      {initial}
    </div>
  );
}
