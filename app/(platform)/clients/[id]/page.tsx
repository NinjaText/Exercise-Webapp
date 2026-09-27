import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { requireRole } from "@/lib/current-user";
import { getCapabilitiesForUser } from "@/lib/org-capabilities.server";
import { getClientCoachingPanel } from "@/lib/clubs/trainer-coaching";
import { ClientCoachingPanel } from "@/components/clients/client-coaching-panel";
import { getClientDetail, getClientIdsForTrainer } from "@/lib/services/client.service";
import * as sessionService from "@/lib/services/session.service";
import * as programService from "@/lib/services/program.service";
import { getThreadItems } from "@/lib/services/inbox.service";
import { getExercisesForPicker } from "@/lib/services/exercise.service";
import { getOrganizationProfile } from "@/actions/organization-actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import {
  ClinicalProfileCard,
  type ClinicalProfile,
} from "@/components/clients/clinical-profile-card";
import { ClientProfileEditButton } from "@/components/clients/client-profile-dialog";
import {
  ClientProgressMenuItem,
  ClientProgressProvider,
  ClientProgressTrigger,
} from "@/components/clients/client-progress-trigger";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  BarChart3,
  Activity,
  MessageSquare,
  Pencil,
  Sparkles,
  Upload,
  Camera,
  Library,
} from "lucide-react";
import { AssignProgramButton } from "@/components/clients/assign-program-button";
import { ClientCalendar } from "@/components/calendar/client-calendar";
import { AssignedProgramsList } from "@/components/clients/assigned-programs-list";
import { ClientAdherenceSummary } from "@/components/clients/client-adherence-summary";
import { MessageThread } from "@/components/messages/message-thread";
import { getDisplayName } from "@/lib/utils/display-name";

/** Tabs that `?tab=` may select. Anything else falls back to the Calendar default. */
const CLIENT_DETAIL_TABS = ["calendar", "programs", "messages"] as const;
type ClientDetailTab = (typeof CLIENT_DETAIL_TABS)[number];

function resolveInitialTab(tab: string | undefined): ClientDetailTab {
  return CLIENT_DETAIL_TABS.includes(tab as ClientDetailTab)
    ? (tab as ClientDetailTab)
    : "calendar";
}

interface Props {
  params: Promise<{ id: string }>;
  /** `?tab=` lets deep links (e.g. an AI insight's "Review Program") open a specific tab. */
  searchParams?: Promise<{ tab?: string }>;
}

export default async function ClientDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { tab } = (await searchParams) ?? {};
  const requestedTab = resolveInitialTab(tab);
  const [user, { orgId: sessionOrgId }] = await Promise.all([
    requireRole("TRAINER"),
    auth(),
  ]);
  const organizationOrgId = sessionOrgId ?? user.clerkOrgId ?? undefined;
  const clientIds = await getClientIdsForTrainer(user.id);
  if (!clientIds.includes(id)) notFound();
  const client = await getClientDetail(id);

  if (!client) notFound();

  // Fetch V2 sessions, programs, exercise library, adherence history, and the
  // trainer↔client message thread for the tabs on this page.
  // An uncoached club member has no inbox or check-ins; hide those controls
  // (the server actions already refuse). Trainer-org clients keep everything.
  const clientCaps = await getCapabilitiesForUser({
    id: client.id,
    role: "CLIENT",
    clerkOrgId: client.clerkOrgId,
  });
  const canMessage = clientCaps.messaging;
  const initialTab = requestedTab === "messages" && !canMessage ? "calendar" : requestedTab;
  const [v2Sessions, assignedPrograms, exerciseLibrary, pastSessions, threadItems, organizationProfile, coachingPanel] =
    await Promise.all([
      sessionService.getSessionsForClient(client.id),
      programService.getProgramsForClient(client.id),
      getExercisesForPicker(organizationOrgId),
      sessionService.getClientPastSessions(client.id),
      canMessage ? getThreadItems(user.id, client.id, { includeInternal: true }) : Promise.resolve([]),
      getOrganizationProfile().catch(() => null),
      // null (and no coaching query) unless this is a club trainer.
      getClientCoachingPanel(user, client.id),
    ]);

  const adherence = sessionService.computeAdherenceStats(pastSessions);

  // Transform sessions to the shape the calendar expects
  const calendarSessions = v2Sessions.map((s) => ({
    id: s.id,
    scheduledDate: s.scheduledDate,
    status: s.status,
    workout: {
      id: s.workout.id,
      name: s.workout.name,
      program: { trainerId: s.workout.program.trainerId },
      blocks: s.workout.blocks.map((b) => ({
        exercises: b.exercises.map((e) => ({ id: e.id })),
      })),
    },
  }));

  const displayName = getDisplayName(client);
  const showEmail = Boolean(client.email) && displayName !== client.email;
  const clinicalProfile = client.clientProfile as ClinicalProfile | null;

  return (
    <PageShell>
      <Tabs defaultValue={initialTab} className="gap-6">
        <ClientProgressProvider clientId={id} clientName={displayName}>
          <PageHeader
            breadcrumb={[{ label: "Clients", href: "/clients" }, { label: displayName }]}
            title={displayName}
            description={
              [showEmail ? client.email : null, client.dateOfBirth ? `Born ${client.dateOfBirth}` : null]
                .filter(Boolean)
                .join(" · ") || undefined
            }
            primaryAction={
              <AssignProgramButton
                client={{
                  id: client.id,
                  firstName: client.firstName,
                  lastName: client.lastName,
                  email: client.email,
                  imageUrl: client.imageUrl,
                }}
              />
            }
            // Below sm, Message and Progress move into the overflow menu so the
            // header keeps one row: Assign program + More.
            secondaryActions={
              <>
                {canMessage && (
                  <Button variant="outline" className="hidden sm:inline-flex" asChild>
                    <Link href={`/messages/${client.id}`}>
                      <MessageSquare className="size-4" />
                      Message
                    </Link>
                  </Button>
                )}
                <ClientProgressTrigger className="hidden sm:inline-flex" />
              </>
            }
            overflowLead={
              <>
                {canMessage && (
                  <DropdownMenuItem className="sm:hidden" render={<Link href={`/messages/${client.id}`} />}>
                    <MessageSquare className="size-4" />
                    Message
                  </DropdownMenuItem>
                )}
                <ClientProgressMenuItem className="sm:hidden" />
              </>
            }
            overflow={[
              { label: "Create program", href: `/programs/new?clientId=${id}`, icon: Pencil },
              { label: "Generate with AI", href: `/programs/generate?clientId=${id}`, icon: Sparkles },
              { label: "Upload a program", href: `/programs/upload?clientId=${id}`, icon: Upload },
              { label: "Sessions", href: `/clients/${id}/adherence`, icon: Activity },
              { label: "Outcomes", href: `/clients/${id}/outcomes`, icon: BarChart3 },
              { label: "Photos & notes", href: `/clients/${id}/progress`, icon: Camera },
            ]}
          />
        </ClientProgressProvider>

        {coachingPanel && <ClientCoachingPanel coaching={coachingPanel} />}

        <ClientAdherenceSummary
          clientId={id}
          completionRate={adherence.completionRate}
          completed={adherence.completed}
          missedOrSkipped={adherence.missed + adherence.skipped}
          avgRPE={adherence.avgRPE}
          total={adherence.total}
        />

        {/* Always rendered, even when empty: a client who clicked through the intake
            questions leaves nothing here, and the trainer needs somewhere to put
            what they learn in the first session. */}
        <ClinicalProfileCard
          profile={clinicalProfile}
          action={
            <ClientProfileEditButton
              clientId={client.id}
              client={{
                firstName: client.firstName,
                lastName: client.lastName,
                phone: client.phone,
                dateOfBirth: client.dateOfBirth,
                ...(clinicalProfile ?? {}),
              }}
            />
          }
        />

        {/* The tabs switch only the work area below; the coaching, adherence and
            clinical summaries above stay put, so the tab strip sits here rather
            than under the page title. */}
        <div className="border-b border-border">
          <TabsList variant="line">
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            <TabsTrigger value="programs">Programs ({assignedPrograms.length})</TabsTrigger>
            {canMessage && <TabsTrigger value="messages">Messages</TabsTrigger>}
          </TabsList>
        </div>

        <TabsContent value="calendar">
          <ClientCalendar
            clientId={client.id}
            trainerId={user.id}
            initialSessions={calendarSessions}
            exerciseLibrary={exerciseLibrary}
            organizationOrganizationId={organizationOrgId}
            exerciseSourcePreference={organizationProfile?.exerciseSourcePreference}
          />
        </TabsContent>

        <TabsContent value="programs">
          <SectionCard title="Assigned programs" icon={Library} count={assignedPrograms.length}>
            <AssignedProgramsList programs={assignedPrograms} />
          </SectionCard>
        </TabsContent>

        {canMessage && (
        <TabsContent value="messages">
          <Card className="gap-0 py-0">
            <div className="h-[70dvh] max-h-[640px]">
              <MessageThread
                items={threadItems}
                currentUserId={user.id}
                recipientId={client.id}
                recipientName={getDisplayName(client)}
              />
            </div>
          </Card>
        </TabsContent>
        )}
      </Tabs>
    </PageShell>
  );
}
