import { Suspense } from "react";
import { connection } from "next/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { BrandStyle } from "@/components/branding/brand-style";
import { getCurrentBranding } from "@/lib/services/branding.service";
import { resolveBranding } from "@/lib/branding/resolve";
import { toViewModel } from "@/lib/branding/types";
import { BillingSuccess } from "./billing-success";

export default async function BillingSuccessPage() {
  // Per-request page: opt out of prerendering before the (catch-guarded) lookup.
  await connection();
  // A branding lookup failure must never break this page: fall back to defaults.
  const branding = await getCurrentBranding().catch(() => resolveBranding(null));

  return (
    <>
      <BrandStyle branding={branding} />
      <AuthShell
        branding={toViewModel(branding)}
        headline="Payment received"
        subhead="We're confirming your subscription."
        footer={null}
      >
        <Suspense fallback={null}>
          <BillingSuccess />
        </Suspense>
      </AuthShell>
    </>
  );
}
