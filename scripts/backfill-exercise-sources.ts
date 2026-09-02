import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.$runCommandRaw({
    update: "Exercise",
    updates: [
      {
        q: { source: { $exists: false } },
        u: { $set: { source: "UNIVERSAL" } },
        multi: true,
      },
    ],
  });
  console.log("Migration result:", JSON.stringify(result, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
