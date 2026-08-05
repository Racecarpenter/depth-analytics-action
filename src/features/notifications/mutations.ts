"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export async function markAllNotificationsRead(): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  // Every other write in the app goes through the admin client with an
  // explicit auth check first (see lib/supabase/admin.ts) — this one used
  // the RLS-scoped client instead, which is both an inconsistency and the
  // thing tripping up TypeScript here, so it's switched to match.
  const admin = createAdminClient();
  await admin
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

  revalidatePath("/");
  return { ok: true };
}
