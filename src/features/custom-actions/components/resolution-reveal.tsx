import { Card, CardContent } from "@/components/ui/card";

/** The "Results are in" reveal once a Custom Action's vote goes unanimous. */
export function ResolutionReveal({ winnerName, participantCount }: { winnerName: string; participantCount: number }) {
  return (
    <Card className="mb-5">
      <CardContent className="pt-5 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Results are in</p>
        <p className="mt-1 text-sm text-ink-muted">
          {participantCount}/{participantCount} agree
        </p>
        <p className="mt-3 text-lg font-semibold text-ink">🏆 {winnerName}</p>
      </CardContent>
    </Card>
  );
}
