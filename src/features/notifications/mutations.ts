"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/utils/log-error";

/**
 * Marks a single notification read — used when a notification row is
 * clicked/navigated (see NotificationBell). Deliberately best-effort: the
 * caller navigates regardless of whether this succeeds (see the "Do not
 * make navigation dependent on the mark-read request succeeding" note on
 * NotificationBell), so this never throws, just logs.
 */
export async function markNotificationRead(notificationId: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const admin = createAdminClient();
  const { error } = await admin
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", user.id);
  if (error) {
    logError("[markNotificationRead] update failed:", error);
    return { ok: false };
  }

  revalidatePath("/");
  return { ok: true };
}

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
