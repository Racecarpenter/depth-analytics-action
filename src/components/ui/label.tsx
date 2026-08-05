import { type LabelHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("mb-2 block text-xs font-medium uppercase tracking-wide text-ink-faint", className)}
      {...props}
    />
  );
}
