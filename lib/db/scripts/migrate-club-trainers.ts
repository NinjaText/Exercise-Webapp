import { clerkClient } from "@clerk/nextjs/server";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureHouseCoach } from "@/lib/services/house-coach.service";
import { removeOrgTrainer, transferClubOwnership } from "@/lib/services/club-ownership.service";

export interface ClubMigrationRow {
  clerkOrgId: string;
  name: string;
  houseCoach: "existing" | "created" | "would create";
  oldTrainers: number;
  programsTransferred: number;
  templatesTransferred: number;
  checkInRows: number;
  messages: number;
  /** Every remaining program the old trainer owned (library, templates, other clients). */
  ownedPrograms: number;
  clinicalNotes: number;
  pendingAssignments: number;
  collections: number;
  habits: number;
  trainersRemoved: number;
  invitationsRevoked: number;
  error?: string;
}

export interface MigrationReport {
  apply: boolean;
  clubs: ClubMigrationRow[];
  failed: number;
}

const INVITATION_PAGE_SIZE = 100;

const EMPTY_OWNED = { ownedPrograms: 0, clinicalNotes: 0, pendingAssignments: 0, collections: 0, habits: 0 };

/**
 * Moves the old trainer's collections to the house coach. Collection names are
 * unique per trainer, so a clash is renamed "<name> (<old trainer>)" (numbered
 * if that is taken too).
 */
async function moveCollections(old: User, houseCoachId: string): Promise<number> {
  const mine = await prisma.collection.findMany({ where: { trainerId: old.id }, select: { id: true, name: true } });
  if (mine.length === 0) return 0;
  const taken = new Set(
    (await prisma.collection.findMany({ where: { trainerId: houseCoachId }, select: { name: true } })).map((c) => c.name)
  );
  const owner = `${old.firstName} ${old.lastName}`.trim() || old.email;
  for (const c of mine) {
    let name = c.name;
    for (let n = 1; taken.has(name); n++) name = n === 1 ? `${c.name} (${owner})` : `${c.name} (${owner} ${n})`;
    taken.add(name);
    await prisma.collection.update({ where: { id: c.id }, data: { trainerId: houseCoachId, name } });
  }
  return mine.length;
}

/** Hands the old trainer's remaining owned rows to the house coach (or counts them on a dry run). */
async function moveOwnedRows(old: User, houseCoachId: string | null): Promise<typeof EMPTY_OWNED> {
  const byOld = { where: { trainerId: old.id } };
  if (!houseCoachId) {
    return {
      ownedPrograms: await prisma.program.count(byOld),
      clinicalNotes: await prisma.clinicalNote.count(byOld),
      pendingAssignments: await prisma.pendingProgramAssignment.count(byOld),
      collections: await prisma.collection.count(byOld),
      habits: await prisma.habitDefinition.count(byOld),
    };
  }
  const toHouse = { ...byOld, data: { trainerId: houseCoachId } };
  return {
    ownedPrograms: (await prisma.program.updateMany(toHouse)).count,
    clinicalNotes: (await prisma.clinicalNote.updateMany(toHouse)).count,
    pendingAssignments: (await prisma.pendingProgramAssignment.updateMany(toHouse)).count,
    habits: (await prisma.habitDefinition.updateMany(toHouse)).count,
    collections: await moveCollections(old, houseCoachId),
  };
}

function addOwned(row: ClubMigrationRow, owned: typeof EMPTY_OWNED): void {
  for (const key of Object.keys(EMPTY_OWNED) as (keyof typeof EMPTY_OWNED)[]) row[key] += owned[key];
}

/**
 * Pending Clerk invitations that would admit a trainer into the club. All pages
 * are collected before anything is revoked, since revoking shifts the list.
 */
async function pendingTrainerInvitations(clerkOrgId: string) {
  const client = await clerkClient();
  const found: { id: string }[] = [];
  for (let offset = 0; ; offset += INVITATION_PAGE_SIZE) {
    const page = await client.organizations.getOrganizationInvitationList({
      organizationId: clerkOrgId,
      status: ["pending"],
      limit: INVITATION_PAGE_SIZE,
      offset,
    });
    for (const inv of page.data) {
      if ((inv.publicMetadata as { invitedRole?: string } | null)?.invitedRole === "TRAINER") found.push(inv);
    }
    if (page.data.length < INVITATION_PAGE_SIZE || offset + page.data.length >= page.totalCount) break;
  }
  return found;
}

async function migrateClub(
  org: Awaited<ReturnType<typeof prisma.organization.findMany>>[number],
  apply: boolean
): Promise<ClubMigrationRow> {
  const { clerkOrgId } = org;
  const row: ClubMigrationRow = {
    clerkOrgId,
    name: org.name,
    houseCoach: org.houseCoachUserId ? "existing" : apply ? "created" : "would create",
    oldTrainers: 0,
    programsTransferred: 0,
    templatesTransferred: 0,
    checkInRows: 0,
    messages: 0,
    ...EMPTY_OWNED,
    trainersRemoved: 0,
    invitationsRevoked: 0,
  };

  // Revoked first so a later trainer-step failure can't leave a live legacy invite.
  const invitations = await pendingTrainerInvitations(clerkOrgId);
  if (apply) {
    const client = await clerkClient();
    for (const inv of invitations) {
      await client.organizations.revokeOrganizationInvitation({
        organizationId: clerkOrgId,
        invitationId: inv.id,
      });
      row.invitationsRevoked += 1;
    }
  } else {
    row.invitationsRevoked = invitations.length;
  }

  const houseCoach = apply ? await ensureHouseCoach(org) : null;
  const houseCoachId = houseCoach?.id ?? org.houseCoachUserId;
  const oldTrainers = await prisma.user.findMany({
    where: { clerkOrgId, role: "TRAINER", ...(houseCoachId ? { id: { not: houseCoachId } } : {}) },
  });
  row.oldTrainers = oldTrainers.length;

  for (const old of oldTrainers) {
    if (apply && houseCoach) {
      const moved = await transferClubOwnership(clerkOrgId, houseCoach.id);
      row.programsTransferred += moved.programs;
      row.templatesTransferred += moved.templates;
      const toHouse = { data: { trainerId: houseCoach.id } };
      const templates = await prisma.checkInTemplate.updateMany({ where: { trainerId: old.id }, ...toHouse });
      const assignments = await prisma.checkInAssignment.updateMany({ where: { trainerId: old.id }, ...toHouse });
      row.checkInRows += templates.count + assignments.count;
      const sent = await prisma.message.updateMany({ where: { senderId: old.id }, data: { senderId: houseCoach.id } });
      const received = await prisma.message.updateMany({
        where: { recipientId: old.id },
        data: { recipientId: houseCoach.id },
      });
      row.messages += sent.count + received.count;
      addOwned(row, await moveOwnedRows(old, houseCoach.id));
      await removeOrgTrainer(clerkOrgId, old);
      row.trainersRemoved += 1;
    } else {
      row.checkInRows +=
        (await prisma.checkInTemplate.count({ where: { trainerId: old.id } })) +
        (await prisma.checkInAssignment.count({ where: { trainerId: old.id } }));
      row.messages +=
        (await prisma.message.count({ where: { senderId: old.id } })) +
        (await prisma.message.count({ where: { recipientId: old.id } }));
      addOwned(row, await moveOwnedRows(old, null));
    }
  }

  return row;
}

/**
 * Moves every club from per-club trainers to the built-in house coach.
 * Idempotent; one club failing is recorded and does not stop the rest.
 */
export async function migrateClubTrainers({ apply }: { apply: boolean }): Promise<MigrationReport> {
  const orgs = await prisma.organization.findMany({ where: { type: "CLUB" } });
  const clubs: ClubMigrationRow[] = [];
  for (const org of orgs) {
    try {
      clubs.push(await migrateClub(org, apply));
    } catch (err) {
      console.error(`Club ${org.clerkOrgId} failed:`, err);
      clubs.push({
        clerkOrgId: org.clerkOrgId,
        name: org.name,
        houseCoach: org.houseCoachUserId ? "existing" : "would create",
        oldTrainers: 0,
        programsTransferred: 0,
        templatesTransferred: 0,
        checkInRows: 0,
        messages: 0,
        ...EMPTY_OWNED,
        trainersRemoved: 0,
        invitationsRevoked: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { apply, clubs, failed: clubs.filter((c) => c.error).length };
}

/**
 * Run after `npx prisma db push`:
 *   npm run db:migrate-club-trainers            # dry run
 *   npm run db:migrate-club-trainers -- --apply # write
 */
async function main() {
  // tsx doesn't load .env; Node's loader never overrides already-set vars.
  try {
    process.loadEnvFile(".env");
  } catch {
    // No .env file — rely on the environment.
  }
  const apply = process.argv.includes("--apply");
  const report = await migrateClubTrainers({ apply });

  console.log(apply ? "APPLY — club trainers migrated:" : "DRY RUN — nothing written (pass --apply to write):");
  for (const c of report.clubs) {
    console.log(
      `  ${c.name} (${c.clerkOrgId}): house coach ${c.houseCoach}, ${c.oldTrainers} old trainer(s), ` +
        `${c.programsTransferred} programs / ${c.templatesTransferred} templates transferred, ` +
        `${c.checkInRows} check-in rows, ${c.messages} messages, ` +
        `${c.ownedPrograms} other owned programs, ${c.clinicalNotes} clinical notes, ` +
        `${c.pendingAssignments} pending assignments, ${c.collections} collections, ${c.habits} habits, ` +
        `${c.trainersRemoved} removed, ${c.invitationsRevoked} trainer invitation(s) ${apply ? "revoked" : "to revoke"}` +
        (c.error ? `  FAILED: ${c.error}` : "")
    );
  }
  console.log(`${report.clubs.length} club(s), ${report.failed} failed.`);
  process.exit(report.failed > 0 ? 1 : 0);
}

// Only run when executed directly (tests import migrateClubTrainers).
if (process.argv[1]?.endsWith("migrate-club-trainers.ts")) {
  main().catch((error) => {
    console.error("Club trainer migration failed:", error);
    process.exit(1);
  });
}
