import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database.types";

/**
 * Append-only product-analytics logging, separate from the financial
 * ledger on purpose (see supabase/migrations/0005_monetization.sql). Never
 * throws — a failed analytics write should never break the feature it's
 * observing.
 */
export async function logAnalyticsEvent(
  admin: SupabaseClient<Database>,
  input: { eventName: string; userId?: string | null; actionId?: string | null; metadata?: Json },
): Promise<void> {
  const { error } = await admin.from("analytics_events").insert({
    event_name: input.eventName,
    user_id: input.userId ?? null,
    action_id: input.actionId ?? null,
    metadata: input.metadata ?? {},
  });
  if (error) console.error("[logAnalyticsEvent] insert failed:", error.message);
}
