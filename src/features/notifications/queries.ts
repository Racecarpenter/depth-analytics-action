import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/domain";

export async function getRecentNotifications(limit = 12): Promise<Tables<"notifications">[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}
