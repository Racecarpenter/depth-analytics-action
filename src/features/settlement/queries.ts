import "server-only";

import { createClient } from "@/lib/supabase/server";

/** RLS-scoped — participants can read their own Action's settlement events. */
export async function getLastNudgeAt(actionId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payment_settlement_events")
    .select("created_at")
    .eq("action_id", actionId)
    .eq("event_type", "manual_nudge")
    .order("created_at", { ascending: false })
    .limit(1)
    .returns<{ created_at: string }[]>()
    .maybeSingle();
  return data?.created_at ?? null;
}
