import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Vote counts per selected participant for a round — never who voted for
 * whom, just aggregate counts. Only meaningful to show once every accepted
 * participant has voted (the Action detail page only calls this after
 * confirming that), since showing partial tallies mid-round is exactly the
 * "follow the leader" effect independent submission is meant to avoid.
 */
export interface VoteTallyEntry {
  participantId: string;
  votes: number;
}

export async function getVoteTally(actionId: string, round: number): Promise<VoteTallyEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("custom_action_votes")
    .select("selected_participant_id")
    .eq("action_id", actionId)
    .eq("round", round)
    .returns<{ selected_participant_id: string }[]>();

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.selected_participant_id, (counts.get(row.selected_participant_id) ?? 0) + 1);
  }
  return [...counts.entries()].map(([participantId, votes]) => ({ participantId, votes }));
}

/** Whether the given participant has already submitted a result this round. */
export async function hasVotedThisRound(actionId: string, round: number, voterParticipantId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("custom_action_votes")
    .select("id")
    .eq("action_id", actionId)
    .eq("round", round)
    .eq("voter_participant_id", voterParticipantId)
    .maybeSingle();
  return Boolean(data);
}

export async function getVoteCountForRound(actionId: string, round: number): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("custom_action_votes")
    .select("id", { count: "exact", head: true })
    .eq("action_id", actionId)
    .eq("round", round);
  return count ?? 0;
}
