import type { ActionStatus, ParticipantRole, Tables } from "@/types/database.types";

export type ActionRow = Tables<"actions">;
export type ParticipantRow = Tables<"participants">;
export type GameRow = Tables<"games">;
export type TeamRow = Tables<"teams">;

export interface ParticipantWithUser extends ParticipantRow {
  user: Pick<Tables<"users">, "id" | "display_name" | "cashtag"> | null;
}

export interface ActionWithDetails extends ActionRow {
  game: GameRow & {
    home_team: TeamRow;
    away_team: TeamRow;
  };
  participants: ParticipantWithUser[];
}

/**
 * Once an Action is settled, who's owed money and who owes it — derived
 * from the canonical (creator's-perspective) status, never stored
 * separately. Returns null while pending/accepted/live/declined/cancelled/
 * expired, or on a push (nobody owes anybody).
 */
export function getWinnerLoser(
  action: Pick<ActionWithDetails, "status" | "participants">,
): { winner: ParticipantWithUser; loser: ParticipantWithUser } | null {
  if (action.status !== "won" && action.status !== "lost") return null;

  const creator = action.participants.find((p) => p.role === "creator");
  const opponent = action.participants.find((p) => p.role === "opponent");
  if (!creator || !opponent) return null;

  return action.status === "won" ? { winner: creator, loser: opponent } : { winner: opponent, loser: creator };
}

/**
 * actions.status is stored canonically from the creator's point of view.
 * Flip won/lost for the opponent so every viewer sees "did I win" — every
 * other status (push, pending, accepted, live, declined, cancelled, expired)
 * reads the same for both sides.
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

export function opponentOf(
  action: Pick<ActionWithDetails, "participants">,
  userId: string,
): ParticipantRow | undefined {
  return action.participants.find((p) => p.user_id !== userId);
}
