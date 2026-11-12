import { NextResponse } from "next/server";
import { getSellablePackageBySlug } from "@/lib/services/sellable-package.service";
import { createProgramCheckoutSession } from "@/lib/payments/program-checkout";
import { prisma } from "@/lib/prisma";
import { checkClientLimit } from "@/lib/billing/client-limit";

/** Shown on the public buy page when the seller is at their plan's client cap. */
const SELLER_AT_CLIENT_LIMIT =
  "This coach isn't taking new clients right now. Please check back soon or contact them directly.";

export async function POST(req: Request) {
  const body = (await req.json()) as { slug?: string; withBundle?: boolean };
  if (!body.slug) return new NextResponse("Missing slug", { status: 400 });

  const pkg = await getSellablePackageBySlug(body.slug);
  if (!pkg || !pkg.programTemplateId) {
    return new NextResponse("Package not found", { status: 404 });
  }

  // A purchase adds the buyer to the seller's org as a client, so the seller's
  // plan cap applies. Checked before payment — never refuse after someone paid.
  // (Known trade-off: the buyer's email is only known inside Stripe, so an
  // existing client re-buying while the coach is at the cap is refused too.)
  try {
    const seller = await prisma.user.findUnique({
      where: { id: pkg.trainerId },
      select: { id: true, role: true, clerkOrgId: true, email: true, billingExemptAt: true },
    });
    if (seller) {
      const limit = await checkClientLimit(seller, 1);
      if (!limit.ok) {
        return NextResponse.json({ error: SELLER_AT_CLIENT_LIMIT, code: "client_limit" }, { status: 409 });
      }
    }
  } catch (err) {
    // A failed lookup must not block sales; fulfillment still works.
    console.error("program checkout client-limit check failed:", err);
  }

  // Prices + templates are ALL server-derived from the package record.
  const packages = [{ name: pkg.name, priceInCents: pkg.priceInCents, currency: pkg.currency }];
  const packageIds = [pkg.id];

  if (body.withBundle && pkg.upsell && pkg.upsell.programTemplateId) {
    packages.push({
      name: pkg.upsell.name,
      priceInCents: pkg.upsell.priceInCents,
      currency: pkg.upsell.currency,
    });
    packageIds.push(pkg.upsell.id);
  }

  try {
    const { url } = await createProgramCheckoutSession({
      packages,
      packageIds,
      successSlug: pkg.slug!,
    });
    return NextResponse.json({ url });
  } catch (err) {
    console.error("program checkout error", err);
    return new NextResponse("Checkout error", { status: 500 });
  }
}
