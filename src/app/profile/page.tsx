import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { PageContainer } from "@/components/layout/page-container";
import { requireUser } from "@/features/auth/session";
import { ProfileForm } from "@/features/users/components/profile-form";
import { formatPhoneForDisplay } from "@/lib/utils/phone";

export default async function ProfilePage() {
  const user = await requireUser();

  return (
    <>
      <AppHeader />
      <PageContainer>
        <BackLink href="/account" label="Account" />
        <h1 className="mb-1 text-xl font-semibold text-ink">Your profile</h1>
        <p className="mb-6 text-sm text-ink-faint">
          Shown to people you have Action with, instead of your phone number.
        </p>

        <ProfileForm
          initialDisplayName={user.display_name}
          initialUsername={user.username}
          initialAvatarPath={user.avatar_path}
        />

        <p className="mt-8 text-xs text-ink-faint">
          Phone: {formatPhoneForDisplay(user.phone)} — used for sign-in only, never shown to other participants once you have a profile.
        </p>
      </PageContainer>
    </>
  );
}
