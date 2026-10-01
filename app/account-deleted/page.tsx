import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/auth/auth-shell";
import { getOrgBranding } from "@/lib/services/branding.service";
import { toViewModel } from "@/lib/branding/types";

export const metadata = { title: "Account deleted" };

export default async function AccountDeletedPage() {
  // The account (and its org link) is gone, so show product branding.
  const branding = toViewModel(await getOrgBranding(null));

  return (
    <AuthShell
      branding={branding}
      headline="Your account has been deleted"
      subhead="Your profile, health and fitness records, and messages have been removed."
    >
      <div className="flex flex-col items-start gap-6">
        <p className="text-body text-muted-foreground">
          We&apos;re sorry to see you go. You are welcome to come back and create a
          new account at any time.
        </p>
        <Button asChild variant="outline">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </AuthShell>
  );
}
