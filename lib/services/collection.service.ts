import { prisma } from "@/lib/prisma";

export async function listCollections(trainerId: string) {
  return prisma.collection.findMany({ where: { trainerId }, orderBy: { name: "asc" } });
}

export async function getCollectionsWithCounts(trainerId: string) {
  const collections = await prisma.collection.findMany({
    where: { trainerId },
    orderBy: { name: "asc" },
  });
  if (collections.length === 0) return [];

  const counts = await Promise.all(
    collections.map((c) =>
      prisma.program.count({
        where: { trainerId, collectionIds: { has: c.id }, isGlobal: { not: true } },
      })
    )
  );

  return collections.map((c, i) => ({ ...c, programCount: counts[i] }));
}

export async function createCollection(trainerId: string, name: string) {
  // Creating a collection counts as "opening" it, so a brand-new collection
  // starts at the front of the recently-viewed order rather than the back.
  return prisma.collection.create({
    data: { trainerId, name: name.trim(), lastViewedAt: new Date() },
  });
}

export async function renameCollection(id: string, name: string) {
  return prisma.collection.update({ where: { id }, data: { name: name.trim() } });
}

/** Marks a collection as just-opened so it sorts to the front of the Library grid. */
export async function touchCollectionViewed(id: string, trainerId: string) {
  return prisma.collection.updateMany({
    where: { id, trainerId },
    data: { lastViewedAt: new Date() },
  });
}

// Deleting a collection removes it from every program's collectionIds so no
// program is left pointing at a dangling id.
export async function deleteCollection(id: string, trainerId: string) {
  const programs = await prisma.program.findMany({
    where: { trainerId, collectionIds: { has: id } },
    select: { id: true, collectionIds: true },
  });
  await Promise.all(
    programs.map((p) =>
      prisma.program.update({
        where: { id: p.id },
        data: { collectionIds: p.collectionIds.filter((cid) => cid !== id) },
      })
    )
  );
  return prisma.collection.delete({ where: { id } });
}
