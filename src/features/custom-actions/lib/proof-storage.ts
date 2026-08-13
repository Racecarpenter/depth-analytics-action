import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/utils/log-error";
import { CUSTOM_ACTION_PROOF_ALLOWED_TYPES, CUSTOM_ACTION_PROOF_MAX_BYTES } from "@/lib/constants";

const BUCKET = "custom-action-proof";

export interface UploadProofPhotoResult {
  ok: boolean;
  error?: string;
  path?: string;
}

/**
 * Validates and uploads a participant's proof photo (server-side type/size
 * check — never trusted from the client alone, even though the browser
 * also downscales before sending). Caller must already have confirmed the
 * uploader is an accepted participant on this Action; this function trusts
 * participantId as given, matching how other admin-client helpers in this
 * codebase keep authorization in the calling mutation, not the storage
 * helper itself. Path is deterministic (`{actionId}/{participantId}.ext`)
 * and upserts, so re-submitting proof for the same vote just replaces it —
 * "maximum one image per participant submission" falls out of the path
 * shape rather than needing separate enforcement.
 */
export async function uploadProofPhoto(actionId: string, participantId: string, file: File): Promise<UploadProofPhotoResult> {
  if (!CUSTOM_ACTION_PROOF_ALLOWED_TYPES.includes(file.type as (typeof CUSTOM_ACTION_PROOF_ALLOWED_TYPES)[number])) {
    return { ok: false, error: "Use a JPEG, PNG, or WebP image." };
  }
  if (file.size > CUSTOM_ACTION_PROOF_MAX_BYTES) {
    return { ok: false, error: "That image is too large." };
  }

  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${actionId}/${participantId}.${extension}`;

  const admin = createAdminClient();
  const { error } = await admin.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: true,
  });

  if (error) {
    logError("[uploadProofPhoto] upload failed:", error);
    return { ok: false, error: "Couldn't upload that image. Try again." };
  }

  return { ok: true, path };
}

/**
 * Short-lived signed URL for rendering a private proof photo — the bucket
 * has no public access, so this is the only way to display one. Callers
 * are responsible for confirming the viewer is a participant on the
 * relevant Action before calling this (matches Storage RLS itself, which
 * would independently block a non-participant anyway).
 */
export async function getProofPhotoUrl(path: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) {
    logError("[getProofPhotoUrl] signing failed:", error);
    return null;
  }
  return data.signedUrl;
}
