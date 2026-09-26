import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSellablePackageBySlug } from "@/lib/services/sellable-package.service";
import { getOrgBranding } from "@/lib/services/branding.service";
import { toViewModel } from "@/lib/branding/types";
import { brandIconsMetadata } from "@/lib/branding/metadata";
import { BrandStyle } from "@/components/branding/brand-style";
import { OrgIdentity } from "@/components/branding/org-identity";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

  const price = (pkg.priceInCents / 100).toFixed(2);
  const bundle = pkg.upsell && pkg.upsell.programTemplateId ? pkg.upsell : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-muted to-info-soft px-4 py-12">
      <BrandStyle branding={branding} />
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <OrgIdentity branding={brandingVm} surface="light" />
        </div>
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-foreground">{pkg.name}</h1>
          {pkg.description && <p className="mt-1 text-muted-foreground">{pkg.description}</p>}
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl font-bold">${price}</CardTitle>
            <CardDescription>One-time payment</CardDescription>
          </CardHeader>
          <CardContent>
            <BuyButton
              slug={pkg.slug!}
              bundle={
                bundle
                  ? { name: bundle.name, price: (bundle.priceInCents / 100).toFixed(2), description: bundle.description ?? "" }
                  : null
              }
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
