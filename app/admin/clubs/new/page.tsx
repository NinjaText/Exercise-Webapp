import { prisma } from "@/lib/prisma";
import { getProgramSchedulingType } from "@/lib/utils/program-scheduling";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { ClubForm } from "../club-form";

export default async function NewClubPage() {
  const programs = await prisma.program.findMany({
    where: { isGlobal: true },
    select: { id: true, name: true, schedulingType: true },
    orderBy: { name: "asc" },
  });
  const globalPrograms = programs
    .filter((p) => getProgramSchedulingType(p) === "SCHEDULED")
    .map(({ id, name }) => ({ id, name }));

  return (
    <PageShell width="narrow">
      <PageHeader
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Clubs", href: "/admin/clubs" }, { label: "New" }]}
        title="New club"
        back={{ label: "Back to Clubs", href: "/admin/clubs" }}
      />
      <ClubForm mode="create" globalPrograms={globalPrograms} />
      <p className="text-sm text-muted-foreground">The club name is used as its brand automatically. Logo and colour editing for clubs is a follow-up.</p>
    </PageShell>
  );
}
