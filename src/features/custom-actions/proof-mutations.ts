"use server";

import { getCurrentUser } from "@/features/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadProofPhoto } from "./lib/proof-storage";

export interface UploadProofResult {
  ok: boolean;
  error?: string;
  path?: string;
}

/**
 * Kept separate from mutations.ts (rather than exported alongside
 * submitCustomActionVote) since it takes FormData/File — a distinct enough
 * shape from the rest of that file's plain-object inputs to warrant its
 * own small module.
 */
export async function uploadCustomActionProof(actionId: string, formData: FormData): Promise<UploadProofResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { ok: false, error: "You need to be signed in." };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No image selected." };

  const admin = createAdminClient();
  const { data: participant } = await admin
    .from("participants")
    .select("id")
    .eq("action_id", actionId)
    .eq("user_id", currentUser.id)
    .eq("status", "accepted")
    .maybeSingle();

  if (!participant) return { ok: false, error: "Only participants on this Action can attach proof." };

  return uploadProofPhoto(actionId, participant.id, file);
}
