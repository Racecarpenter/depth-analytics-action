import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionWithDetails } from "@/features/actions/types";
import type { Database, NotificationType, ParticipantRole } from "@/types/database.types";

export async function createNotification(
  admin: SupabaseClient<Database>,
  input: { userId: string; actionId: string; type: NotificationType; title: string; body: string },
) {
  await admin.from("notifications").insert({
    user_id: input.userId,
    action_id: input.actionId,
    type: input.type,
    title: input.title,
    body: input.body,
  });
}

/**
 * Notifies every participant on an Action who has a linked account (an
 * invited-but-not-yet-signed-up phone number has nothing to notify). `bodyFor`
 * receives each participant's role so the copy can be personalized — e.g.
 * "You won" vs "You lost" from the same settlement event.
 */
export async function notifyParticipants(
  admin: SupabaseClient<Database>,
  action: ActionWithDetails,
  type: NotificationType,
  title: string,
  bodyFor: (viewerRole: ParticipantRole) => string,
) {
  for (const participant of action.participants) {
    if (!participant.user_id) continue;
    await createNotification(admin, {
      userId: participant.user_id,
      actionId: action.id,
      type,
      title,
      body: bodyFor(participant.role),
    });
  }
}
