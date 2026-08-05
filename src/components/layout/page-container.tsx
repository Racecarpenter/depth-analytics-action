import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function PageContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-xl px-4 pb-24 pt-6 sm:px-6", className)}>
      {children}
    </div>
  );
}
