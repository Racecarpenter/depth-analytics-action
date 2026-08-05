"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { searchGames } from "../queries";
import { GameResultRow } from "./game-result-row";

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function GameSearch() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 250);

  const { data: events, isFetching } = useQuery({
    queryKey: ["games-search", debouncedQuery],
    queryFn: () => searchGames(debouncedQuery),
    placeholderData: (previous) => previous,
  });

  return (
    <div>
      <Input
        type="search"
        placeholder="Search teams, leagues, or games"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />

      <div className="mt-4 space-y-2">
        {isFetching && !events && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}

        {events?.length === 0 && (
          <EmptyState title="No games found" description="Try a different team, league, or matchup." />
        )}

        {events?.map((event) => <GameResultRow key={event.id} event={event} />)}
      </div>
    </div>
  );
}
