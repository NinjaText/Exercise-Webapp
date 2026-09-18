import { notFound } from "next/navigation";
import { getSellablePackageBySlug } from "@/lib/services/sellable-package.service";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BuyButton } from "./buy-button";

export default async function SalesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const pkg = await getSellablePackageBySlug(slug);
  if (!pkg || !pkg.programTemplateId) notFound();

  const price = (pkg.priceInCents / 100).toFixed(2);
  const bundle = pkg.upsell && pkg.upsell.programTemplateId ? pkg.upsell : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-muted to-info-soft px-4 py-12">
      <div className="w-full max-w-md">
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
