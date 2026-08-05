import { AppHeader } from "@/components/layout/app-header";
import { BackLink } from "@/components/layout/back-link";
import { PageContainer } from "@/components/layout/page-container";
import { Card, CardContent } from "@/components/ui/card";
import { CashtagForm } from "@/features/account/components/cashtag-form";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { requireUser } from "@/features/auth/session";
import { formatPhoneForDisplay } from "@/lib/utils/phone";

export default async function AccountPage() {
  const user = await requireUser();

  return (
    <>
      <AppHeader />
      <PageContainer>
        <BackLink href="/" label="Home" />
        <h1 className="mb-1 text-xl font-semibold text-ink">Account</h1>
        <p className="mb-6 text-sm text-ink-faint">{formatPhoneForDisplay(user.phone)}</p>

        <Card className="mb-6">
          <CardContent className="pt-5">
            <CashtagForm initialCashtag={user.cashtag} />
          </CardContent>
        </Card>

        <SignOutButton />
      </PageContainer>
    </>
  );
}
