import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionStatus, ChangedByActor, Database } from "@/types/database.types";

/** Appends one row to action_status_history. Shared by mutations and the settlement cron. */
export async function recordStatusChange(
  admin: SupabaseClient<Database>,
  actionId: string,
  fromStatus: ActionStatus | null,
  toStatus: ActionStatus,
  changedBy: ChangedByActor,
  note?: string,
) {
  await admin.from("action_status_history").insert({
    action_id: actionId,
    from_status: fromStatus,
    to_status: toStatus,
    changed_by: changedBy,
    note: note ?? null,
  });
}
