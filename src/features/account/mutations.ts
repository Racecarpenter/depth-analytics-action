"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/utils/log-error";
import { cashtagSchema } from "@/lib/validations/account";

export interface AccountMutationResult {
  ok: boolean;
  error?: string;
}

/** Sets or clears the signed-in user's Cash App $cashtag. Pass an empty string to clear it. */
export async function updateCashtag(rawCashtag: string): Promise<AccountMutationResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You need to be signed in." };

  if (rawCashtag.trim() === "") {
    const admin = createAdminClient();
    const { error } = await admin.from("users").update({ cashtag: null }).eq("id", user.id);
    if (error) {
      logError("[updateCashtag] clear failed:", error);
      return { ok: false, error: "Couldn't update that. Try again." };
    }
    revalidatePath("/account");
    return { ok: true };
  }

  const parsed = cashtagSchema.safeParse({ cashtag: rawCashtag });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a valid $cashtag." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("users").update({ cashtag: parsed.data.cashtag }).eq("id", user.id);
  if (error) {
    logError("[updateCashtag] update failed:", error);
    return { ok: false, error: "Couldn't update that. Try again." };
  }

  revalidatePath("/account");
  return { ok: true };
}
