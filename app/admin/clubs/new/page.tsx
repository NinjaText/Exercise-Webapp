import { prisma } from "@/lib/prisma";
import { resourceOptions, starterOptions } from "../[orgId]/starter-options";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { ClubForm } from "../club-form";

export default async function NewClubPage() {
  const programs = await prisma.program.findMany({
    where: { isGlobal: true },
    select: { id: true, name: true, schedulingType: true, isGlobal: true },
    orderBy: { name: "asc" },
  });
  const globalPrograms = starterOptions(programs, []);
  const resourcePrograms = resourceOptions(programs, []);

  return (
    <PageShell width="narrow">
      <PageHeader
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Clubs", href: "/admin/clubs" }, { label: "New" }]}
        title="New club"
        back={{ label: "Back to clubs", href: "/admin/clubs" }}
      />
      <ClubForm mode="create" globalPrograms={globalPrograms} resourcePrograms={resourcePrograms} />
      <p className="text-body text-muted-foreground">The club name is used as its brand automatically. The club trainer can set the logo and colours from their Settings once they join.</p>
    </PageShell>
  );
}
