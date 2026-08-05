"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Most of ACTION's data flows through Server Components + Server Actions, so
 * this is deliberately small — it exists for the handful of client-side
 * interactions (live game search-as-you-type) that benefit from React
 * Query's caching and request de-duplication rather than a full page fetch.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
