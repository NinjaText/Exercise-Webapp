import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { BellRing, Clock, CreditCard, ExternalLink, Percent, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getOrgType } from "@/lib/org-capabilities";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard } from "@/components/shared/stat-card";
import { DataList, type Column } from "@/components/shared/data-list";
import { StatusBadge } from "@/components/shared/status-badge";
import { COACHING_BADGE } from "@/lib/ui/status";
import { getClubAttentionCounts } from "@/lib/services/club-alerts.service";
import { getHouseCoach } from "@/lib/services/house-coach.service";
import { describeClubPrice } from "@/lib/services/club-pricing.service";
import { priceFormField } from "./price-fields";
import { clubProgramWhere, resourceOptions, starterOptions } from "./starter-options";
import { ClubForm } from "../club-form";
import { ExtendTrialButton } from "./extend-trial-button";
import { ConvertToTrainerButton } from "./convert-to-trainer-button";
import { CopyValue } from "./copy-value";
import { ManageClubButton } from "./manage-club-button";
import { CLUB_MEMBER_LIST_LIMIT, memberListTruncationNote } from "./members-limit";

interface PageProps {
  params: Promise<{ orgId: string }>;
}

export default async function AdminClubDetailPage({ params }: PageProps) {
  const { orgId } = await params;
  const org = await prisma.organization.findUnique({ where: { clerkOrgId: orgId } });
  if (!org || getOrgType(org) !== "CLUB") notFound();

  const [houseCoach, attentionCounts] = await Promise.all([getHouseCoach(orgId), getClubAttentionCounts()]);
  const attention = attentionCounts.get(orgId) ?? 0;

  const now = new Date();
  const [programs, members, coachingRows, membershipPrice, coachingPrice, statusCounts, expired] = await Promise.all([
    // Global Programs, the house coach's templates and the current starters/resources.
    prisma.program.findMany({
      where: clubProgramWhere([...org.starterProgramIds, ...(org.resourceProgramIds ?? [])], houseCoach?.id ?? null),
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
    prisma.memberSubscription.groupBy({ by: ["status"], where: { clerkOrgId: orgId }, _count: { _all: true } }),
    // Same rule as listClubsWithStats: a TRIALING row past its end date counts as ended.
    prisma.memberSubscription.count({ where: { clerkOrgId: orgId, status: "TRIALING", trialEndsAt: { lt: now } } }),
  ]);
  const countOf = (s: string) => statusCounts.find((g) => g.status === s)?._count._all ?? 0;
  const memberTotal = statusCounts.reduce((n, g) => n + g._count._all, 0);
  const trialing = countOf("TRIALING") - expired;
  const paying = countOf("ACTIVE") + countOf("PAST_DUE");
  const decided = memberTotal - trialing;
  const conversion = decided > 0 ? `${Math.round((paying / decided) * 100)}%` : "—";
  const membershipField = priceFormField(membershipPrice);
  const coachingField = priceFormField(coachingPrice);
  const coachingByUser = new Map(coachingRows.map((c) => [c.userId, c.status]));

  const globalPrograms = starterOptions(programs, org.starterProgramIds);
  const resourcePrograms = resourceOptions(programs, org.resourceProgramIds ?? []);

  type Member = (typeof members)[number];
  const columns: Column<Member>[] = [
    {
      key: "name",
      header: "Member",
      render: (m) => {
        const name = [m.user.firstName, m.user.lastName].filter(Boolean).join(" ");
        return (
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="size-8">
              <AvatarFallback className="bg-brand-soft text-xs font-semibold text-brand-foreground">
                {initials(name || m.user.email)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{name || "—"}</p>
              <p className="truncate text-caption">{m.user.email}</p>
            </div>
          </div>
        );
      },
    },
    { key: "status", header: "Status", render: (m) => <StatusBadge status={m.status} size="sm" /> },
    {
      key: "trialEnds",
      header: "Trial ends",
      className: "hidden md:table-cell",
      render: (m) => (
        <span className="text-caption">{format(new Date(m.trialEndsAt), "MMM d, yyyy")}</span>
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
          <span className="text-caption">—</span>
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

  const houseCoachName = houseCoach
    ? [houseCoach.firstName, houseCoach.lastName].filter(Boolean).join(" ") || houseCoach.email
    : null;
  const clubState = houseCoach
    ? { label: "Active", role: "success" as const }
    : { label: "No house coach", role: "danger" as const };
  const joinPath = `/join/${org.joinSlug}`;

  return (
    <PageShell>
      <PageHeader
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Clubs", href: "/admin/clubs" }, { label: org.name }]}
        title={org.name}
        back={{ label: "Back to clubs", href: "/admin/clubs" }}
        meta={
          <>
            <StatusBadge status={clubState.label} label={clubState.label} role={clubState.role} />
            <span>Created {format(org.createdAt, "MMM d, yyyy")}</span>
          </>
        }
        secondaryActions={
          <Button variant="outline" asChild>
            <Link href={joinPath} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-4" />
              View join page
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          size="compact"
          label="Needs attention"
          value={attention}
          icon={BellRing}
          role={attention > 0 ? "danger" : undefined}
        />
        <StatCard size="compact" label="Members" value={memberTotal} icon={Users} />
        <StatCard size="compact" label="On trial" value={trialing} icon={Clock} role="warning" />
        <StatCard size="compact" label="Paying" value={paying} icon={CreditCard} role="success" />
        <StatCard size="compact" label="Trial conversion" value={conversion} icon={Percent} role="info" />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <ClubForm
          mode="edit"
          clerkOrgId={orgId}
          globalPrograms={globalPrograms}
          resourcePrograms={resourcePrograms}
          initial={{
            name: org.name,
            joinSlug: org.joinSlug ?? "",
            joinCode: org.joinCode ?? "",
            trialDays: org.trialDays ?? 14,
            membershipAmount: membershipField.amount,
            coachingAmount: coachingField.amount,
            starterProgramIds: org.starterProgramIds,
            resourceProgramIds: org.resourceProgramIds ?? [],
          }}
          priceNotes={{ membership: membershipField.note, coaching: coachingField.note }}
        />

        <aside className="flex flex-col gap-6">
          <SectionCard title="House coach">
            <div className="flex flex-col gap-4">
              {houseCoachName ? (
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="size-10">
                    <AvatarFallback className="bg-brand-soft text-sm font-semibold text-brand-foreground">
                      {initials(houseCoachName)}
                    </AvatarFallback>
                  </Avatar>
                  <p className="truncate text-body font-medium text-foreground">{houseCoachName}</p>
                </div>
              ) : (
                <p className="text-body text-muted-foreground">No house coach yet.</p>
              )}
              <p className="text-body text-muted-foreground">
                Members talk to this account. Admins manage the club through it.
              </p>
              <ManageClubButton clerkOrgId={org.clerkOrgId} />
            </div>
          </SectionCard>

          <SectionCard title="Joining" description="Share both with new members.">
            <div className="flex flex-col gap-4">
              <CopyValue label="Join link" value={joinPath} absolute />
              <CopyValue label="Access code" value={org.joinCode ?? "—"} />
            </div>
          </SectionCard>

          <SectionCard title="Branding">
            <p className="text-body text-muted-foreground">
              Admins manage the club&apos;s logo and colours through the house coach.
            </p>
          </SectionCard>

          <SectionCard
            title="Convert to trainer org"
            description="Stops member billing and turns off the join link. Only possible while the club has no members."
            className="ring-danger-border"
          >
            <ConvertToTrainerButton clerkOrgId={orgId} hasMembers={members.length > 0} />
          </SectionCard>
        </aside>
      </div>

      <SectionCard
        title="Members"
        count={memberTotal}
        description={memberListTruncationNote(members.length)}
        contentClassName="px-0 pb-0"
      >
        <DataList
          columns={columns}
          data={members}
          keyExtractor={(m) => m.id}
          emptyMessage="No members have joined yet."
          className="rounded-none border-t border-border shadow-none ring-0"
        />
      </SectionCard>
    </PageShell>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}
