import type { ActionStatus, ParticipantRole, Tables } from "@/types/domain";

export type ActionRow = Tables<"actions">;
export type ParticipantRow = Tables<"participants">;
export type GameRow = Tables<"games">;
export type TeamRow = Tables<"teams">;

export interface ParticipantWithUser extends ParticipantRow {
  user: Pick<Tables<"users">, "id" | "display_name" | "username" | "avatar_path" | "cashtag"> | null;
}

export interface ActionWithDetails extends ActionRow {
  // null for Custom Actions — sports Actions always have one (action_type
  // determines which, enforced by the action_type_fields_match DB check).
  game:
    | (GameRow & {
        home_team: TeamRow;
        away_team: TeamRow;
      })
    | null;
  participants: ParticipantWithUser[];
}

/**
 * Who won and who owes money, for any Action type. Deliberately keyed off
 * `winner_participant_id` alone rather than branching on `action_type` —
 * sports grading (src/app/api/cron/settle/route.ts) sets that column the
 * same way unanimous custom consensus does (submit_custom_action_vote),
 * so this function never needs to know which kind of Action it's looking
 * at. Returns null before resolution, and permanently for a push (nobody
 * owes anybody — no winner_participant_id is ever set on a push).
 *
 * `losers` is plural because a Custom Action can have up to 7 of them; for
 * a 2-participant sports Action it's always exactly one.
 */
export function getResolution(
  action: Pick<ActionWithDetails, "winner_participant_id" | "participants">,
): { winner: ParticipantWithUser; losers: ParticipantWithUser[] } | null {
  if (!action.winner_participant_id) return null;

  const winner = action.participants.find((p) => p.id === action.winner_participant_id);
  if (!winner) return null;

  const losers = action.participants.filter(
    (p) => p.id !== action.winner_participant_id && p.status === "accepted",
  );
  if (losers.length === 0) return null;

  return { winner, losers };
}

/**
 * actions.status is stored canonically from the creator's point of view
 * for sports Actions (won/lost), flipped here for the opponent so every
 * viewer sees "did I win." Every other status — including the custom-only
 * 'resolved' — already reads the same for everyone, so this is a no-op for
 * Custom Actions; they never use 'won'/'lost' at all (see getResolution
 * for how a viewer's personal outcome is actually determined there).
 */
export function personalStatus(status: ActionStatus, viewerRole: ParticipantRole | null): ActionStatus {
  if (viewerRole !== "opponent") return status;
  if (status === "won") return "lost";
  if (status === "lost") return "won";
  return status;
}

export function findParticipant(
  action: Pick<ActionWithDetails, "participants">,
  userId: string,
): ParticipantRow | undefined {
  return action.participants.find((p) => p.user_id === userId);
}

/**
 * The other participant in a 2-participant (sports) Action. Returns
 * ParticipantWithUser (not just ParticipantRow) — callers rely on
 * `.user` to resolve identity (see features/users/lib/identity.ts).
 */
export function opponentOf(
  action: Pick<ActionWithDetails, "participants">,
  userId: string,
): ParticipantWithUser | undefined {
  return action.participants.find((p) => p.user_id !== userId);
}

/** Every participant besides the viewer — for Custom Actions' N-person participant list. */
export function otherParticipants(
  action: Pick<ActionWithDetails, "participants">,
  userId: string,
): ParticipantWithUser[] {
  return action.participants.filter((p) => p.user_id !== userId);
}

/**
 * Whether the viewer currently has an outstanding Accept/Decline decision on
 * this Action — the one piece of "what do I need to do here" that isn't
 * already derived somewhere else (voting availability lives in
 * VotingPanel/getVoteCountForRound, settlement command availability lives in
 * PaymentSettlementCard/ObligationList, both driven directly off server
 * state already). Used by both the Action detail page (to show Accept/
 * Decline) and ActionCard (to badge it on Home) so the two never disagree
 * about what counts as "needs your response."
 */
export function canRespondToInvite(action: Pick<ActionWithDetails, "status" | "participants">, viewerId: string): boolean {
  if (action.status !== "pending") return false;
  const viewer = findParticipant(action, viewerId);
  return viewer?.status === "invited";
}
