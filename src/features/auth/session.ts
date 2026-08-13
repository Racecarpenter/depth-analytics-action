import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/utils/log-error";
import type { Tables } from "@/types/domain";

/** Returns the signed-in user's profile row, or null if not authenticated. */
export async function getCurrentUser(): Promise<Tables<"users"> | null> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  const { data, error } = await supabase.from("users").select("*").eq("id", authUser.id).maybeSingle();
  if (error) {
    logError("[getCurrentUser] public.users lookup failed:", error);
  } else if (!data) {
    // A valid Supabase Auth session exists but there's no matching
    // public.users row — requireUser() will bounce this back to /login,
    // which looks identical to "never signed in" from the outside. If you
    // see this log, the fix is almost always re-running verifyOtp (it
    // upserts this row), not a session/cookie problem.
    console.error("[getCurrentUser] auth session exists but no public.users row for id:", authUser.id);
  }
  return data;
}

/** Same as getCurrentUser, but redirects to /login when there's no session. */
export async function requireUser(): Promise<Tables<"users">> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
