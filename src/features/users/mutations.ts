"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/utils/log-error";
import { profileSchema } from "@/lib/validations/profile";
import { deleteAvatar, uploadAvatar } from "./lib/avatar-storage";
import { markNotificationRead } from "@/features/notifications/mutations";

export interface ProfileMutationResult {
  ok: boolean;
  error?: string;
}

// Postgres unique_violation — thrown by users_username_lower_idx when two
// users race to claim the same username. The DB index is the actual source
// of truth for uniqueness; this is just translating its error into
// something a user can read (see lib/validations/profile.ts's doc comment).
const UNIQUE_VIOLATION = "23505";

/**
 * Updates display name + username. Also marks any outstanding
 * `profile_completion` notification read — see notifications/mutations.ts's
 * markNotificationRead, and README ("User profiles") for why there's no
 * separate `profile_completed_at` column: this mutation succeeding *is* the
 * completion event.
 */
export async function updateProfile(input: { displayName: string; username: string }): Promise<ProfileMutationResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You need to be signed in." };

  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your profile details." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("users")
    .update({ display_name: parsed.data.displayName, username: parsed.data.username })
    .eq("id", user.id);

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { ok: false, error: "That username is taken." };
    }
    logError("[updateProfile] update failed:", error);
    return { ok: false, error: "Couldn't save that. Try again." };
  }

  await dismissProfileCompletionNotification(user.id);

  revalidatePath("/profile");
  revalidatePath("/account");
  revalidatePath("/");
  return { ok: true };
}

export interface AvatarMutationResult {
  ok: boolean;
  error?: string;
}

/** Kept separate from updateProfile since it takes FormData/File, matching the custom-actions proof-upload split. */
export async function uploadUserAvatar(formData: FormData): Promise<AvatarMutationResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You need to be signed in." };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No image selected." };

  const uploadResult = await uploadAvatar(user.id, file);
  if (!uploadResult.ok || !uploadResult.path) {
    return { ok: false, error: uploadResult.error ?? "Couldn't upload that image." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("users").update({ avatar_path: uploadResult.path }).eq("id", user.id);
  if (error) {
    logError("[uploadUserAvatar] users update failed:", error);
    return { ok: false, error: "Couldn't save that photo. Try again." };
  }

  revalidatePath("/profile");
  revalidatePath("/account");
  revalidatePath("/");
  return { ok: true };
}

export async function removeUserAvatar(): Promise<AvatarMutationResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You need to be signed in." };

  const admin = createAdminClient();
  const { error } = await admin.from("users").update({ avatar_path: null }).eq("id", user.id);
  if (error) {
    logError("[removeUserAvatar] update failed:", error);
    return { ok: false, error: "Couldn't remove that. Try again." };
  }

  await deleteAvatar(user.id);

  revalidatePath("/profile");
  revalidatePath("/account");
  revalidatePath("/");
  return { ok: true };
}

/** Best-effort, matches markNotificationRead's own best-effort contract — never blocks the profile save. */
async function dismissProfileCompletionNotification(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("type", "profile_completion")
    .is("read_at", null)
    .limit(1);

  if (error) {
    logError("[dismissProfileCompletionNotification] lookup failed:", error);
    return;
  }
  if (data?.[0]) await markNotificationRead(data[0].id);
}
