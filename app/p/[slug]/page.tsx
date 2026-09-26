import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSellablePackageBySlug } from "@/lib/services/sellable-package.service";
import { getOrgBranding } from "@/lib/services/branding.service";
import { toViewModel } from "@/lib/branding/types";
import { brandIconsMetadata } from "@/lib/branding/metadata";
import { BrandStyle } from "@/components/branding/brand-style";
import { OrgIdentity } from "@/components/branding/org-identity";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getNativeInfo } from "@/lib/native/server";
import { NativePurchaseNotice } from "@/components/billing/native-purchase-notice";
import { BuyButton } from "./buy-button";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const pkg = await getSellablePackageBySlug(slug);
  if (!pkg) return {};

  const branding = await getOrgBranding(pkg.trainer.clerkOrgId ?? null);
  return {
    // `absolute`: app/p has no layout of its own, so a plain string would get
    // the root "%s | INMOTUS RX" template appended after the org name.
    title: { absolute: `${pkg.name} | ${branding.displayName}` },
    ...brandIconsMetadata(branding),
  };
}

export default async function SalesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const pkg = await getSellablePackageBySlug(slug);
  if (!pkg || !pkg.programTemplateId) notFound();

  const branding = await getOrgBranding(pkg.trainer.clerkOrgId ?? null);
  const brandingVm = toViewModel(branding);
  const native = await getNativeInfo();

  const price = (pkg.priceInCents / 100).toFixed(2);
  const bundle = pkg.upsell && pkg.upsell.programTemplateId ? pkg.upsell : null;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-12">
      <BrandStyle branding={branding} />
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <OrgIdentity branding={brandingVm} surface="light" />
        </div>
        <Card className="gap-6 py-6 shadow-md">
          <CardHeader className="gap-2">
            <h1 className="text-title text-balance text-foreground">{pkg.name}</h1>
            {pkg.description && <p className="text-body text-muted-foreground">{pkg.description}</p>}
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {/* No price or purchase path inside the native app (Apple 3.1.1). */}
            {native.isNative ? (
              <NativePurchaseNotice />
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  <p className="text-display tabular-nums text-foreground">${price}</p>
                  <p className="text-caption">One-time payment</p>
                </div>
                <BuyButton
                  slug={pkg.slug!}
                  bundle={
                    bundle
                      ? { name: bundle.name, price: (bundle.priceInCents / 100).toFixed(2), description: bundle.description ?? "" }
                      : null
                  }
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
