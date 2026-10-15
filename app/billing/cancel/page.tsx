import Link from "next/link";
import { CreditCard } from "lucide-react";
import { connection } from "next/server";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/auth/auth-shell";
import { BrandStyle } from "@/components/branding/brand-style";
import { getCurrentBranding } from "@/lib/services/branding.service";
import { resolveBranding } from "@/lib/branding/resolve";
import { toViewModel } from "@/lib/branding/types";

export default async function BillingCancelPage() {
  // Per-request page: opt out of prerendering before the (catch-guarded) lookup.
  await connection();
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
        {/* Mirrors the success page: icon badge, heading, then the next step. */}
        <div className="flex flex-col items-start gap-4">
          <div className="flex size-14 items-center justify-center rounded-full bg-neutral-soft">
            <CreditCard className="size-6 text-muted-foreground" aria-hidden />
          </div>
          <h2 className="text-title text-foreground">Checkout canceled</h2>
          <p className="text-body text-muted-foreground">
            You haven&apos;t been charged. Compare the plans again and pick up where you left off.
          </p>
          <Button asChild size="lg" className="mt-2 h-11 w-full sm:w-auto">
            <Link href="/billing">View plans</Link>
          </Button>
        </div>
      </AuthShell>
    </>
  );
}
