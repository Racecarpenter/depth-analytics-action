import { maskPhone } from "@/lib/utils/phone";

/**
 * The one place "what do we call this person" is decided. Every screen that
 * shows a participant's identity (Home cards, Action detail, invite
 * screens, the person picker) should go through this — never re-derive the
 * display_name-or-phone fallback inline, so a future identity change (a new
 * field, a different fallback rule) is a one-file change instead of a
 * codebase search. See README ("User profiles") for the full picture.
 *
 * Phone numbers are never the primary visible identity once a profile
 * exists — this only ever falls back to a masked phone when display_name
 * is unset, matching the product rule that phone numbers are for auth/
 * invitation, not for browsing who's who.
 */

export interface IdentitySource {
  display_name: string | null;
  username: string | null;
  avatar_path: string | null;
}

export interface ResolvedIdentity {
  /** display_name if set, otherwise a masked phone number. Never raw phone. */
  name: string;
  /** "@username" if set, otherwise null. */
  handle: string | null;
  avatarUrl: string | null;
  /** True once there's a real profile to show (display_name is set) — false means the phone fallback is in effect. */
  hasProfile: boolean;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

/**
 * Pure string construction, zero network calls — safe to call for every
 * participant on a page without any N+1 risk. Works because the `avatars`
 * bucket is public (see supabase/migrations/0020_avatar_storage.sql); a
 * private bucket would need a signed URL per avatar instead.
 */
export function getAvatarUrl(avatarPath: string | null | undefined): string | null {
  if (!avatarPath || !SUPABASE_URL) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/avatars/${avatarPath}`;
}

/**
 * `phone` is required and always used for the fallback — callers should
 * never skip it just because they expect `source` to be present, since an
 * incomplete profile (e.g. avatar set but no display_name yet) still needs
 * to fall back correctly.
 */
export function resolveIdentity(source: IdentitySource | null | undefined, phone: string): ResolvedIdentity {
  const displayName = source?.display_name?.trim();
  if (!displayName) {
    return { name: maskPhone(phone), handle: null, avatarUrl: null, hasProfile: false };
  }
  return {
    name: displayName,
    handle: source?.username ? `@${source.username}` : null,
    avatarUrl: getAvatarUrl(source?.avatar_path),
    hasProfile: true,
  };
}
