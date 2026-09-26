import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/auth/auth-shell";
import { BrandStyle } from "@/components/branding/brand-style";
import { getCurrentBranding } from "@/lib/services/branding.service";
import { resolveBranding } from "@/lib/branding/resolve";
import { toViewModel } from "@/lib/branding/types";
import { getNativeInfo } from "@/lib/native/server";

export default async function BillingCancelPage() {
  // Per-request page: opt out of prerendering before the (catch-guarded) lookup.
  await connection();
  if ((await getNativeInfo()).isNative) redirect("/dashboard");
  // A branding lookup failure must never break this page: fall back to defaults.
  const branding = await getCurrentBranding().catch(() => resolveBranding(null));

  return (
    <>
      <BrandStyle branding={branding} />
      <AuthShell
        branding={toViewModel(branding)}
        headline="No problem"
        subhead="You can choose a plan whenever you're ready."
      >
        <div className="flex flex-col items-start gap-6">
          <p className="text-body text-muted-foreground">
            Compare the plans again and pick up where you left off.
          </p>
          <Button asChild size="lg" className="h-11">
            <Link href="/billing">View Plans</Link>
          </Button>
        </div>
      </AuthShell>
    </>
  );
}
