import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "h-12 w-full rounded-xl border border-border-strong bg-bg-raised px-4 text-base text-ink placeholder:text-ink-faint",
          "outline-none transition-colors focus:border-accent/60 focus:ring-2 focus:ring-accent/15",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
