import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/utils/log-error";
import { AVATAR_ALLOWED_TYPES, AVATAR_MAX_BYTES } from "@/lib/constants";

const BUCKET = "avatars";

export interface UploadAvatarResult {
  ok: boolean;
  error?: string;
  path?: string;
}

/**
 * Validates and uploads a user's avatar (server-side type/size check — never
 * trusted from the client alone, even though the browser also downscales
 * before sending). Path is deterministic (`{userId}/avatar.{ext}`) and
 * upserts, so re-uploading just replaces the photo — "one image per user"
 * falls out of the path shape. Storage RLS independently enforces that a
 * user can only write under their own `{userId}/` prefix (see
 * supabase/migrations/0020_avatar_storage.sql); `userId` here is trusted
 * because the caller (mutations.ts) already authenticated the session and
 * passes the session's own id, never a client-supplied one.
 */
export async function uploadAvatar(userId: string, file: File): Promise<UploadAvatarResult> {
  if (!AVATAR_ALLOWED_TYPES.includes(file.type as (typeof AVATAR_ALLOWED_TYPES)[number])) {
    return { ok: false, error: "Use a JPEG, PNG, or WebP image." };
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return { ok: false, error: "That image is too large." };
  }

  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/avatar.${extension}`;

  const admin = createAdminClient();
  const { error } = await admin.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: true,
  });

  if (error) {
    logError("[uploadAvatar] upload failed:", error);
    return { ok: false, error: "Couldn't upload that image. Try again." };
  }

  return { ok: true, path };
}

/**
 * Removes a user's avatar file (bucket is upsert-per-fixed-path, so old
 * extensions can linger if a user re-uploads in a different format — this
 * also cleans that up by removing all three possible extensions, which is
 * cheap and avoids needing to track "what extension is currently live").
 */
export async function deleteAvatar(userId: string): Promise<void> {
  const admin = createAdminClient();
  const paths = ["jpg", "png", "webp"].map((ext) => `${userId}/avatar.${ext}`);
  const { error } = await admin.storage.from(BUCKET).remove(paths);
  if (error) logError("[deleteAvatar] remove failed:", error);
}
