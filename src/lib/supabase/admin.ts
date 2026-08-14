import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/**
 * Service-role Supabase client. Bypasses RLS entirely — never import this
 * into anything that ships to the browser (the `server-only` import above
 * makes that a build error if you try).
 *
 * Reserved for:
 *   - the phone-OTP flow (recording sms_consent_events, creating/updating
 *     auth users — code verification itself goes through Twilio Verify, not
 *     this client; see src/features/auth/mutations.ts)
 *   - creating a participant row for a phone number with no account yet
 *   - the settlement cron job
 * All callers are expected to perform their own authorization checks before
 * using this client — it does not do that for you.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
