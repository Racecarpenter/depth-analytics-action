import type { ActionStatus, League } from "@/types/domain";

export const LEAGUES: League[] = ["NFL", "NBA", "MLB", "NHL"];

export const STAKE_DISCLAIMER =
  "This amount is informational only. ACTION does not hold or transfer funds.";

/** Home-screen section groupings, in display order. */
export const STATUS_GROUPS = {
  pending: ["pending"] as ActionStatus[],
  accepted: ["accepted"] as ActionStatus[],
  live: ["live"] as ActionStatus[],
  settled: ["won", "lost", "push", "resolved", "declined", "cancelled", "expired"] as ActionStatus[],
};

export const STATUS_LABEL: Record<ActionStatus, string> = {
  pending: "Pending",
  // "Action On" reads naturally for both Action types (locked in, awaiting a
  // result) — not sports-specific despite being the language from the
  // Sports Action simplification.
  accepted: "Action On",
  declined: "Declined",
  live: "Live",
  // 'won'/'lost' are sports-only in practice — Custom Actions resolve
  // straight to 'resolved' and never use these two values. "Win"/"Lose" is
  // the Sports Action brand language; see README ("Sports Action
  // simplification").
  won: "Win",
  lost: "Lose",
  push: "Push",
  cancelled: "Cancelled",
  expired: "Expired",
  // Custom Actions only — sports Actions resolve straight to won/lost/push.
  resolved: "Resolved",
};

/** Tailwind utility classes for each status, applied to StatusPill. */
export const STATUS_TONE: Record<ActionStatus, string> = {
  pending: "text-warn bg-warn/10 border-warn/20",
  accepted: "text-accent bg-accent/10 border-accent/20",
  live: "text-accent bg-accent/10 border-accent/20",
  won: "text-accent bg-accent/10 border-accent/20",
  lost: "text-danger bg-danger/10 border-danger/20",
  push: "text-ink-muted bg-ink-muted/10 border-ink-muted/20",
  declined: "text-danger bg-danger/10 border-danger/20",
  cancelled: "text-ink-muted bg-ink-muted/10 border-ink-muted/20",
  expired: "text-ink-muted bg-ink-muted/10 border-ink-muted/20",
  resolved: "text-accent bg-accent/10 border-accent/20",
};

export const INVITE_EXPIRY_HOURS = 72;

export const OTP_EXPIRY_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;

export const APP_NAME = "ACTION";
export const APP_TAGLINE = "by Depth Analytics";

// --- Custom Actions ---
// Winner-take-all Actions resolved by unanimous participant vote instead of
// a sports data provider. See src/features/custom-actions/.
export const CUSTOM_ACTION_MIN_PARTICIPANTS = 2; // creator + at least 1 opponent
export const CUSTOM_ACTION_MAX_PARTICIPANTS = 8; // creator + up to 7 invitees
export const CUSTOM_ACTION_TITLE_MAX_LENGTH = 140;
export const CUSTOM_ACTION_PROOF_MAX_BYTES = 5 * 1024 * 1024; // matches the Storage bucket's file_size_limit
export const CUSTOM_ACTION_PROOF_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

// --- SMS consent / Twilio A2P 10DLC ---
// See README ("SMS consent & Twilio A2P 10DLC") for the full compliance
// picture. SMS_DISCLOSURE_VERSION is recorded on every sms_consent_events
// row (supabase/migrations/0016_sms_consent.sql) — bump it any time the
// wording of SMS_DISCLOSURE_TEXT changes materially, so the audit trail can
// always show exactly which version of the disclosure a given consent event
// was given under.
export const SMS_DISCLOSURE_VERSION = "v1";
export const SMS_DISCLOSURE_TEXT =
  "By continuing, you agree to receive transactional SMS from Action, including verification codes, Action invitations, results, and settlement reminders. Message frequency varies. Message & data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase.";

// Appended to every outgoing transactional SMS body (except the OTP code
// itself, which already carries its own short opt-out line — see
// requestOtp) so every message identifies itself as coming from ACTION and
// carries a working opt-out instruction, per the Twilio A2P 10DLC campaign
// registration. Actual STOP/HELP handling is done entirely by Twilio's
// Messaging Service (Advanced Opt-Out) — see README ("SMS consent & Twilio
// A2P 10DLC") — this text is just the required on-message disclosure.
export const SMS_OPT_OUT_SUFFIX = " Reply STOP to opt out.";

// PLACEHOLDER — replace with a real, monitored support address before
// production / before submitting for Twilio review. Used on /privacy,
// /terms, and anywhere else a contact method is shown.
export const SUPPORT_EMAIL = "depthanalyticsllc@gmail.com";
