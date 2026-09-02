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
  return prisma.collection.create({ data: { trainerId, name: name.trim() } });
}

export async function renameCollection(id: string, name: string) {
  return prisma.collection.update({ where: { id }, data: { name: name.trim() } });
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
