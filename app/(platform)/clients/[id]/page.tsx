import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { requireRole } from "@/lib/current-user";
import { getClientDetail, getClientIdsForTrainer } from "@/lib/services/client.service";
import * as sessionService from "@/lib/services/session.service";
import * as programService from "@/lib/services/program.service";
import { getThreadItems } from "@/lib/services/inbox.service";
import { getExercisesForPicker } from "@/lib/services/exercise.service";
import { getOrganizationProfile } from "@/actions/organization-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ClinicalProfileCard,
  hasClinicalContent,
  type ClinicalProfile,
} from "@/components/clients/clinical-profile-card";
import { ArrowLeft, BarChart3, Activity, MessageSquare, Plus } from "lucide-react";
import { CreateProgramMenu } from "@/components/programs/create-program-menu";
import { ClientProgressTrigger } from "@/components/clients/client-progress-trigger";
import { ClientCalendar } from "@/components/calendar/client-calendar";
import { AssignedProgramsList } from "@/components/clients/assigned-programs-list";
import { ClientAdherenceSummary } from "@/components/clients/client-adherence-summary";
import { MessageThread } from "@/components/messages/message-thread";
import { getDisplayName, getInitials } from "@/lib/utils/display-name";

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
  const initialTab = resolveInitialTab(tab);
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
  const [v2Sessions, assignedPrograms, exerciseLibrary, pastSessions, threadItems, organizationProfile] =
    await Promise.all([
      sessionService.getSessionsForClient(client.id),
      programService.getProgramsForClient(client.id),
      getExercisesForPicker(organizationOrgId),
      sessionService.getClientPastSessions(client.id),
      getThreadItems(user.id, client.id, { includeInternal: true }),
      getOrganizationProfile().catch(() => null),
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
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/clients">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </Button>
      </div>

      {/* Identity + adherence in one band. The client's name, the actions you can
          take on them, and how they're tracking are the same question on this
          page; splitting them across two cards pushed the real work below the fold. */}
      <Card className="overflow-hidden shadow-sm ring-1 ring-border/50">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-6">
          <Avatar className="h-12 w-12 shrink-0 sm:h-14 sm:w-14">
            <AvatarImage src={client.imageUrl || undefined} />
            <AvatarFallback className="text-base">{getInitials(client)}</AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold tracking-tight">{displayName}</h1>
            {/* Only show the email again when it isn't already the heading — for a
                client with no name on file, getDisplayName falls back to it. */}
            {showEmail && (
              <p className="mt-0.5 truncate text-sm text-muted-foreground">{client.email}</p>
            )}
            {client.dateOfBirth && (
              <p className="mt-0.5 text-xs text-muted-foreground/70">Born {client.dateOfBirth}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            <CreateProgramMenu clientId={id} trigger={<Button size="sm" />}>
              <Plus className="mr-1 h-4 w-4" />
              Create program
            </CreateProgramMenu>

            {/* The four read-only views sit quieter than the one action that creates something. */}
            <div className="flex flex-wrap items-center gap-0.5 sm:ml-1 sm:border-l sm:border-border/60 sm:pl-2.5">
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/messages/${client.id}`}>
                  <MessageSquare className="mr-1 h-4 w-4" />
                  Message
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/clients/${id}/adherence`}>
                  <Activity className="mr-1 h-4 w-4" />
                  Sessions
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/clients/${id}/outcomes`}>
                  <BarChart3 className="mr-1 h-4 w-4" />
                  Outcomes
                </Link>
              </Button>
              <ClientProgressTrigger clientId={id} clientName={displayName} />
            </div>
          </div>
        </div>

        <ClientAdherenceSummary
          clientId={id}
          completionRate={adherence.completionRate}
          completed={adherence.completed}
          missedOrSkipped={adherence.missed + adherence.skipped}
          avgRPE={adherence.avgRPE}
          total={adherence.total}
        />
      </Card>

      {/* Only when there is something in it — a profile row can exist with every
          field empty, which used to render a heading over blank space. */}
      {hasClinicalContent(clinicalProfile) && (
        <ClinicalProfileCard profile={clinicalProfile!} />
      )}

      {/* Tabbed content: Calendar (default), Programs, Messages */}
      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="programs">Programs ({assignedPrograms.length})</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          </TabsList>

        <TabsContent value="calendar" className="mt-4">
          <ClientCalendar
            clientId={client.id}
            trainerId={user.id}
            initialSessions={calendarSessions}
            exerciseLibrary={exerciseLibrary}
            organizationOrganizationId={organizationOrgId}
            exerciseSourcePreference={organizationProfile?.exerciseSourcePreference}
          />
        </TabsContent>

        <TabsContent value="programs" className="mt-4">
          <Card className="shadow-sm ring-1 ring-border/50">
            <CardHeader>
              <CardTitle className="text-base">Assigned Programs</CardTitle>
            </CardHeader>
            <CardContent>
              <AssignedProgramsList programs={assignedPrograms} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="messages" className="mt-4">
          <Card className="overflow-hidden p-0 shadow-sm ring-1 ring-border/50">
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
      </Tabs>
    </div>
  );
}
