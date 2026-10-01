import { connection } from "next/server";
import { SignOutButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/auth/auth-shell";
import { getCurrentBranding, getOrgBranding } from "@/lib/services/branding.service";
import { toViewModel } from "@/lib/branding/types";

export default async function AccountDeactivatedPage() {
  // Per-request page: opt out of prerendering before the (catch-guarded) lookup.
  await connection();
  // A branding lookup failure must never break this page: fall back to defaults.
  const resolved = await getCurrentBranding().catch(() => getOrgBranding(null));
  const branding = toViewModel(resolved);

  return (
    <AuthShell
      branding={branding}
      headline="Account deactivated"
      subhead="Your account no longer has access to the platform."
    >
      <div className="flex flex-col items-start gap-6">
        <p className="text-body text-muted-foreground">
          If you believe this is a mistake, contact your trainer or an administrator
          for help.
        </p>
        <SignOutButton>
          <Button variant="outline">Sign out</Button>
        </SignOutButton>
      </div>
    </AuthShell>
  );
}
