import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils/slug";
import type { CoachPackage } from "@prisma/client";

async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || "package";
  let candidate = root;
  let n = 1;
  // findUnique on the unique `slug` field
  while (await prisma.coachPackage.findUnique({ where: { slug: candidate } })) {
    n += 1;
    candidate = `${root}-${n}`;
  }
  return candidate;
}

export async function createSellablePackage(args: {
  trainerId: string;
  name: string;
  description?: string;
  priceInCents: number;
  programTemplateId: string;
  kind?: "program" | "bundle";
  upsellPackageId?: string;
}): Promise<CoachPackage> {
  const slug = await uniqueSlug(args.name);
  return prisma.coachPackage.create({
    data: {
      trainerId: args.trainerId,
      name: args.name,
      description: args.description,
      priceInCents: args.priceInCents,
      programTemplateId: args.programTemplateId,
      kind: args.kind ?? "program",
      upsellPackageId: args.upsellPackageId,
      slug,
    },
  });
}

/**
 * `React.cache()`-wrapped so the sales page's `generateMetadata` and page
 * body (which both need this same lookup) share one DB read per request.
 * Outside an RSC render (e.g. the checkout route handler) `cache()` is a
 * transparent passthrough — no request-scoped memoization, but the same
 * correct result.
 */
export const getSellablePackageBySlug = cache(async function getSellablePackageBySlug(
  slug: string
): Promise<
  | (CoachPackage & {
      upsell: CoachPackage | null;
      /** Only the seller's org id — for branding lookup. Nothing else about
       * the trainer (name, email, ids) is exposed to this public page. */
      trainer: { clerkOrgId: string | null };
    })
  | null
> {
  const pkg = await prisma.coachPackage.findFirst({
    where: { slug, isActive: true },
    include: { trainer: { select: { clerkOrgId: true } } },
  });
  if (!pkg) return null;
  const upsell = pkg.upsellPackageId
    ? await prisma.coachPackage.findUnique({ where: { id: pkg.upsellPackageId } })
    : null;
  return { ...pkg, upsell };
});

export async function getSellablePackageByProgramTemplateId(
  programTemplateId: string,
  trainerId: string
): Promise<(CoachPackage & { upsell: CoachPackage | null }) | null> {
  const pkg = await prisma.coachPackage.findFirst({
    where: { programTemplateId, trainerId, kind: "program" },
  });
  if (!pkg) return null;
  const upsell = pkg.upsellPackageId
    ? await prisma.coachPackage.findUnique({ where: { id: pkg.upsellPackageId } })
    : null;
  return { ...pkg, upsell };
}

export async function updateSellablePackage(
  packageId: string,
  trainerId: string,
  args: {
    priceInCents?: number;
    isActive?: boolean;
    bundle?: { programTemplateId: string; priceInCents: number } | null;
  }
): Promise<CoachPackage> {
  const existing = await prisma.coachPackage.findUnique({ where: { id: packageId } });
  if (!existing || existing.trainerId !== trainerId) {
    throw new Error("Package not found");
  }

  let upsellPackageId = existing.upsellPackageId;

  if (args.bundle === null) {
    if (upsellPackageId) {
      await prisma.coachPackage.update({ where: { id: upsellPackageId }, data: { isActive: false } });
    }
    upsellPackageId = null;
  } else if (args.bundle) {
    if (upsellPackageId) {
      await prisma.coachPackage.update({
        where: { id: upsellPackageId },
        data: {
          programTemplateId: args.bundle.programTemplateId,
          priceInCents: args.bundle.priceInCents,
          isActive: true,
        },
      });
    } else {
      const bundleSlug = await uniqueSlug(`${existing.name} Bundle`);
      const created = await prisma.coachPackage.create({
        data: {
          trainerId,
          name: `${existing.name} Bundle`,
          priceInCents: args.bundle.priceInCents,
          programTemplateId: args.bundle.programTemplateId,
          kind: "bundle",
          slug: bundleSlug,
        },
      });
      upsellPackageId = created.id;
    }
  }

  return prisma.coachPackage.update({
    where: { id: packageId },
    data: {
      ...(args.priceInCents !== undefined ? { priceInCents: args.priceInCents } : {}),
      ...(args.isActive !== undefined ? { isActive: args.isActive } : {}),
      upsellPackageId,
    },
  });
}
