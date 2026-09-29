import { notFound } from "next/navigation";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { getOrgType } from "@/lib/org-capabilities";
import { getProgramSchedulingType } from "@/lib/utils/program-scheduling";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { DataList, type Column } from "@/components/shared/data-list";
import { StatusBadge } from "@/components/shared/status-badge";
import { ClubForm } from "../club-form";
import { ExtendTrialButton } from "./extend-trial-button";
import { ConvertToTrainerButton } from "./convert-to-trainer-button";
import { CLUB_MEMBER_LIST_LIMIT, memberListTruncationNote } from "./members-limit";

interface PageProps {
  params: Promise<{ orgId: string }>;
}

export default async function AdminClubDetailPage({ params }: PageProps) {
  const { orgId } = await params;
  const org = await prisma.organization.findUnique({ where: { clerkOrgId: orgId } });
  if (!org || getOrgType(org) !== "CLUB") notFound();

  const [programs, members] = await Promise.all([
    prisma.program.findMany({
      where: { isGlobal: true },
      select: { id: true, name: true, schedulingType: true },
      orderBy: { name: "asc" },
    }),
    prisma.memberSubscription.findMany({
      where: { clerkOrgId: orgId },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: CLUB_MEMBER_LIST_LIMIT,
    }),
  ]);

  // Keep already-selected starters visible even if they later stopped qualifying.
  const globalPrograms = programs
    .filter((p) => getProgramSchedulingType(p) === "SCHEDULED" || org.starterProgramIds.includes(p.id))
    .map(({ id, name }) => ({ id, name }));

  type Member = (typeof members)[number];
  const columns: Column<Member>[] = [
    {
      key: "name",
      header: "Member",
      render: (m) => (
        <span className="font-medium text-foreground">
          {[m.user.firstName, m.user.lastName].filter(Boolean).join(" ") || "—"}
        </span>
      ),
    },
    {
      key: "email",
      header: "Email",
      className: "hidden md:table-cell",
      render: (m) => <span className="text-xs text-muted-foreground">{m.user.email}</span>,
    },
    { key: "status", header: "Status", render: (m) => <StatusBadge status={m.status} size="sm" /> },
    {
      key: "trialEnds",
      header: "Trial ends",
      className: "hidden md:table-cell",
      render: (m) => (
        <span className="text-xs text-muted-foreground">{format(new Date(m.trialEndsAt), "MMM d, yyyy")}</span>
      ),
    },
    {
      key: "starter",
      header: "Starter",
      className: "hidden lg:table-cell",
      render: (m) => <StatusBadge status={m.starterStatus} size="sm" dot={false} />,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (m) => (
        <div className="flex justify-end">
          <ExtendTrialButton
            userId={m.userId}
            disabled={!(m.status === "TRIALING" || (m.status === "CANCELED" && !m.stripeSubscriptionId))}
          />
        </div>
      ),
    },
  ];

  return (
    <PageShell>
      <PageHeader
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Clubs", href: "/admin/clubs" }, { label: org.name }]}
        title={org.name}
        description={`Join link: /join/${org.joinSlug}`}
        back={{ label: "Back to Clubs", href: "/admin/clubs" }}
        meta={<span className="text-sm text-muted-foreground">Type: Club</span>}
        primaryAction={<ConvertToTrainerButton clerkOrgId={orgId} hasMembers={members.length > 0} />}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Club settings">
          <ClubForm
            mode="edit"
            clerkOrgId={orgId}
            globalPrograms={globalPrograms}
            initial={{
              name: org.name,
              joinSlug: org.joinSlug ?? "",
              joinCode: org.joinCode ?? "",
              trialDays: org.trialDays ?? 14,
              stripePriceId: org.stripePriceId ?? "",
              starterProgramIds: org.starterProgramIds,
            }}
          />
        </SectionCard>
        <SectionCard title="Branding">
          <p className="text-sm text-muted-foreground">The club name is used as its brand automatically. Logo and colour editing for clubs is a follow-up.</p>
        </SectionCard>
      </div>

      <SectionCard title="Members" count={members.length} description={memberListTruncationNote(members.length)}>
        <DataList
          columns={columns}
          data={members}
          keyExtractor={(m) => m.id}
          emptyMessage="No members have joined yet."
        />
      </SectionCard>
    </PageShell>
  );
}
