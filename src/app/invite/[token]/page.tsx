import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { AuthFlow } from "@/features/auth/components/auth-flow";
import { getCurrentUser } from "@/features/auth/session";
import { InviteResponse } from "@/features/actions/components/invite-response";
import { verifyInviteToken } from "@/features/actions/lib/signed-token";
import { getInvitePreview } from "@/features/actions/queries";
import { APP_NAME, STAKE_DISCLAIMER } from "@/lib/constants";
import { formatStake } from "@/lib/utils/currency";
import { formatGameTime } from "@/lib/utils/date";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const payload = verifyInviteToken(token);

  if (!payload) {
    return <InvalidInviteScreen />;
  }

  const preview = await getInvitePreview(payload.participantId, payload.actionId);
  if (!preview) {
    return <InvalidInviteScreen />;
  }

  const { participant, action } = preview;
  const currentUser = await getCurrentUser();
  const headline =
    action.action_type === "sports" && action.game
      ? `${action.game.away_team.name} @ ${action.game.home_team.name}`
      : (action.title ?? "Custom Action");

  if (!currentUser) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <p className="text-xs uppercase tracking-wide text-ink-faint">{APP_NAME} challenge</p>
            <h1 className="mt-2 text-xl font-semibold text-ink">{headline}</h1>
            <p className="mt-1 text-sm text-ink-faint">Verify your phone to review and respond.</p>
          </div>
          <AuthFlow redirectTo={`/invite/${token}`} />
        </div>
      </div>
    );
  }

  if (currentUser.phone !== participant.phone) {
    return (
      <>
        <AppHeader />
        <PageContainer>
          <EmptyState
            title="Wrong number"
            description="This invitation was sent to a different phone number than the one you're signed in with."
          />
        </PageContainer>
      </>
    );
  }

  const alreadyResponded = participant.status !== "invited";
  const expired = Boolean(
    participant.invite_expires_at && new Date(participant.invite_expires_at) < new Date(),
  );

  const isSports = action.action_type === "sports" && action.game && action.market;
  const creatorParticipant = action.participants.find((p) => p.role === "creator");
  const creatorName = creatorParticipant?.user?.display_name?.trim() || "Your friend";

  return (
    <>
      <AppHeader />
      <PageContainer>
        <p className="text-xs uppercase tracking-wide text-ink-faint">
          {isSports ? "Youve been challenged" : "Youve been invited"}
        </p>
        <h1 className="mt-1 text-xl font-semibold text-ink">{headline}</h1>
        {isSports && action.game && <p className="mt-0.5 text-sm text-ink-faint">{formatGameTime(action.game.start_time)}</p>}

        <Card className="my-5">
          <CardContent className="grid grid-cols-2 gap-5 pt-5">
            {isSports && action.game && action.market ? (
              <>
                <div>
                  <p className="text-xs text-ink-faint">{creatorName} has</p>
                  <p className="mono-nums mt-0.5 text-sm font-medium text-ink">{creatorParticipant?.side_label ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-faint">You have</p>
                  <p className="mono-nums mt-0.5 text-sm font-medium text-ink">{participant.side_label}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-ink-faint">Action</p>
                  <p className="mono-nums mt-0.5 text-sm font-medium text-ink">{formatStake(action.stake_amount)}</p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="text-xs text-ink-faint">Stake (each)</p>
                  <p className="mono-nums mt-0.5 text-sm font-medium text-ink">{formatStake(action.stake_amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-faint">Players</p>
                  <p className="mono-nums mt-0.5 text-sm font-medium text-ink">{action.participants.length}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <p className="mb-6 text-xs leading-relaxed text-ink-faint">{STAKE_DISCLAIMER}</p>

        {alreadyResponded ? (
          <EmptyState
            title={`You already ${participant.status} this invite`}
            description={participant.status === "accepted" ? "Find it on your home screen." : undefined}
          />
        ) : expired ? (
          <EmptyState title="This invite has expired" description="Ask your friend to send a new one." />
        ) : (
          <InviteResponse token={token} />
        )}
      </PageContainer>
    </>
  );
}

function InvalidInviteScreen() {
  return (
    <>
      <AppHeader />
      <PageContainer>
        <EmptyState
          title="Invalid invite"
          description="This link is invalid or has expired. Ask your friend to send a new one."
        />
      </PageContainer>
    </>
  );
}
