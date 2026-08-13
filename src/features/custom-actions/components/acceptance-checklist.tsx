import { Card, CardContent } from "@/components/ui/card";

export interface AcceptanceChecklistEntry {
  id: string;
  name: string;
  accepted: boolean;
}

/**
 * Visible to everyone while a Custom Action is still pending — "Race ✓ /
 * Mike ✓ / Zane — Waiting." Terms are immutable once every entry here is
 * checked off (see createCustomActionAndInvite / respondToInvite: the
 * Action only flips to "accepted" once everyone has). If anyone declines
 * before that, the whole Action cancels — no partial/rebuilt version.
 */
export function AcceptanceChecklist({ entries }: { entries: AcceptanceChecklistEntry[] }) {
  return (
    <Card className="mb-5">
      <CardContent className="space-y-2.5 pt-5">
        <p className="mb-1 text-sm font-medium text-ink">Waiting on everyone to accept</p>
        {entries.map((entry) => (
          <div key={entry.id} className="flex items-center justify-between">
            <p className="text-sm text-ink-muted">{entry.name}</p>
            <p className={entry.accepted ? "text-sm font-medium text-accent" : "text-xs text-ink-faint"}>
              {entry.accepted ? "✓" : "Waiting"}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
