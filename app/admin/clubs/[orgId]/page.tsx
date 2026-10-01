import { notFound } from "next/navigation";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { getOrgType } from "@/lib/org-capabilities";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { DataList, type Column } from "@/components/shared/data-list";
import { StatusBadge } from "@/components/shared/status-badge";
import { COACHING_BADGE } from "@/lib/ui/status";
import { getClubTrainer, getPendingTrainerInvite } from "@/lib/services/club-trainer.service";
import { describeClubPrice } from "@/lib/services/club-pricing.service";
import { priceFormField, priceSummary } from "./price-fields";
import { starterOptions, starterProgramWhere } from "./starter-options";
import { ClubTrainerControls } from "./club-trainer-controls";
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

  const trainer = await getClubTrainer(orgId);
  const pendingInvite = trainer ? null : await getPendingTrainerInvite(orgId).catch(() => null);

  const [programs, members, coachingRows, membershipPrice, coachingPrice] = await Promise.all([
    // Global Programs, the club trainer's templates and the current starters.
    prisma.program.findMany({
      where: starterProgramWhere(org.starterProgramIds, trainer?.id ?? null),
      select: { id: true, name: true, schedulingType: true, isGlobal: true },
      orderBy: { name: "asc" },
    }),
    prisma.memberSubscription.findMany({
      where: { clerkOrgId: orgId },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: CLUB_MEMBER_LIST_LIMIT,
    }),
    prisma.memberCoaching.findMany({ where: { clerkOrgId: orgId }, select: { userId: true, status: true } }),
    describeClubPrice(org.stripePriceId ?? null),
    describeClubPrice(org.coachingStripePriceId ?? null),
  ]);
  const membershipField = priceFormField(membershipPrice);
  const coachingField = priceFormField(coachingPrice);
  const coachingByUser = new Map(coachingRows.map((c) => [c.userId, c.status]));

  const globalPrograms = starterOptions(programs, org.starterProgramIds);

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
      key: "coaching",
      header: "Coaching",
      className: "hidden lg:table-cell",
      render: (m) => {
        const status = coachingByUser.get(m.userId);
        const badge = status ? COACHING_BADGE[status] : undefined;
        return badge ? (
          <StatusBadge status={status!} label={badge.label} role={badge.role} size="sm" />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        );
      },
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
        meta={
          <span className="text-sm text-muted-foreground">
            Type: Club · Membership {priceSummary(membershipPrice)} · Coaching {priceSummary(coachingPrice)}
          </span>
        }
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
              membershipAmount: membershipField.amount,
              coachingAmount: coachingField.amount,
              starterProgramIds: org.starterProgramIds,
              trainerEmail: "",
            }}
            priceNotes={{ membership: membershipField.note, coaching: coachingField.note }}
          />
        </SectionCard>
        <div className="flex flex-col gap-6">
          <SectionCard title="Club trainer">
            <div className="flex flex-col gap-3">
              {trainer ? (
                <p className="text-sm">
                  <span className="font-medium text-foreground">
                    {[trainer.firstName, trainer.lastName].filter(Boolean).join(" ") || trainer.email}
                  </span>
                  <span className="text-muted-foreground"> · {trainer.email}</span>
                  {!trainer.onboarded && <span className="text-muted-foreground"> · onboarding not finished</span>}
                </p>
              ) : pendingInvite ? (
                <p className="text-sm text-muted-foreground">
                  Invite pending for <span className="font-medium text-foreground">{pendingInvite.email}</span>. The club
                  opens to members once they accept.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">No trainer. The club stays closed until one accepts an invite.</p>
              )}
              <ClubTrainerControls clerkOrgId={orgId} hasTrainer={Boolean(trainer)} invitePending={Boolean(pendingInvite)} />
            </div>
          </SectionCard>
          <SectionCard title="Branding">
            <p className="text-sm text-muted-foreground">
              The club trainer manages the club&apos;s logo and colours from their Settings.
            </p>
          </SectionCard>
        </div>
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
