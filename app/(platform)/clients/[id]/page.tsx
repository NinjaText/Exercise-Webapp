import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { requireRole } from "@/lib/current-user";
import { getClientDetail, getClientIdsForTrainer } from "@/lib/services/client.service";
import * as sessionService from "@/lib/services/session.service";
import * as programService from "@/lib/services/program.service";
import * as messageService from "@/lib/services/message.service";
import { getExercisesForPicker } from "@/lib/services/exercise.service";
import { getOrganizationProfile } from "@/actions/organization-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlanStatusBadge } from "@/components/workout/plan-status-badge";
import { ArrowLeft, BarChart3, Activity, MessageSquare, TrendingUp } from "lucide-react";
import { ClientCalendar } from "@/components/calendar/client-calendar";
import { AssignedProgramsList } from "@/components/clients/assigned-programs-list";
import { ClientAdherenceSummary } from "@/components/clients/client-adherence-summary";
import { MessageThread } from "@/components/messages/message-thread";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ClientDetailPage({ params }: Props) {
  const { id } = await params;
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
  const [v2Sessions, assignedPrograms, exerciseLibrary, pastSessions, threadMessages, organizationProfile] =
    await Promise.all([
      sessionService.getSessionsForClient(client.id),
      programService.getProgramsForClient(client.id),
      getExercisesForPicker(organizationOrgId),
      sessionService.getClientPastSessions(client.id),
      messageService.getThread(user.id, client.id),
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

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/clients">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </Button>
      </div>

      {/* Client info */}
      <Card className="shadow-sm ring-1 ring-border/50">
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:gap-6">
          <Avatar className="h-16 w-16 shrink-0">
            <AvatarImage src={client.imageUrl || undefined} />
            <AvatarFallback className="text-lg">
              {client.firstName[0]}{client.lastName[0]}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-bold tracking-tight">
              {client.firstName} {client.lastName}
            </h2>
            <p className="text-muted-foreground truncate">{client.email}</p>
            {client.dateOfBirth && (
              <p className="text-sm text-muted-foreground/70">DOB: {client.dateOfBirth}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/messages/${client.id}`}>
                <MessageSquare className="mr-1 h-4 w-4" />
                Message
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/clients/${id}/adherence`}>
                <Activity className="mr-1 h-4 w-4" />
                Sessions
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/clients/${id}/outcomes`}>
                <BarChart3 className="mr-1 h-4 w-4" />
                Outcomes
              </Link>
            </Button>
            {/* <Button variant="outline" size="sm" asChild>
              <Link href={`/clients/${id}/progress`}>
                <TrendingUp className="mr-1 h-4 w-4" />
                Progress
              </Link>
            </Button> */}
          </div>
        </CardContent>
      </Card>

      {/* Client profile */}
      {client.clientProfile && (
        <Card className="shadow-sm ring-1 ring-border/50">
          <CardHeader>
            <CardTitle className="text-base">Clinical Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(client.clientProfile as any).primaryDiagnosis && (
              <div className="rounded-md bg-blue-50 border border-blue-100 px-3 py-2">
                <span className="font-semibold text-blue-800">Primary Diagnosis: </span>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <span className="text-blue-700">{(client.clientProfile as any).primaryDiagnosis}</span>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(client.clientProfile as any).secondaryDiagnoses?.length > 0 && (
                  <p className="mt-0.5 text-xs text-blue-600">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    Also: {(client.clientProfile as any).secondaryDiagnoses.join(", ")}
                  </p>
                )}
              </div>
            )}
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(client.clientProfile as any).painScore != null && (
              <div className="flex items-center gap-3">
                <span className="font-medium">Pain Score:</span>
                <div className="flex items-center gap-1.5">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-2.5 w-2.5 rounded-full ${
                        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
                        i < (client.clientProfile as any).painScore
                          ? i < 3 ? "bg-green-400" : i < 6 ? "bg-amber-400" : "bg-red-500"
                          : "bg-muted"
                      }`}
                    />
                  ))}
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <span className="ml-1 text-muted-foreground">{(client.clientProfile as any).painScore}/10</span>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(client.clientProfile as any).activityLevel && (
                <div>
                  <span className="font-medium">Activity Level: </span>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <span className="text-muted-foreground capitalize">{((client.clientProfile as any).activityLevel as string).toLowerCase()}</span>
                </div>
              )}
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(client.clientProfile as any).occupation && (
                <div>
                  <span className="font-medium">Occupation: </span>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <span className="text-muted-foreground">{(client.clientProfile as any).occupation}</span>
                </div>
              )}
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(client.clientProfile as any).injuryDate && (
                <div>
                  <span className="font-medium">Injury Date: </span>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <span className="text-muted-foreground">{new Date((client.clientProfile as any).injuryDate).toLocaleDateString()}</span>
                </div>
              )}
            </div>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(client.clientProfile as any).surgeryHistory && (
              <div>
                <span className="font-medium">Surgery History: </span>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <span className="text-muted-foreground">{(client.clientProfile as any).surgeryHistory}</span>
              </div>
            )}
            {client.clientProfile.limitations && (
              <div>
                <span className="font-medium">Limitations: </span>
                <span className="text-muted-foreground">{client.clientProfile.limitations}</span>
              </div>
            )}
            {client.clientProfile.comorbidities && (
              <div>
                <span className="font-medium">Comorbidities: </span>
                <span className="text-muted-foreground">{client.clientProfile.comorbidities}</span>
              </div>
            )}
            {client.clientProfile.fitnessGoals.length > 0 && (
              <div>
                <span className="font-medium">Goals: </span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {client.clientProfile.fitnessGoals.map((g) => (
                    <Badge key={g} variant="secondary" className="text-xs">{g}</Badge>
                  ))}
                </div>
              </div>
            )}
            {client.clientProfile.availableEquipment.length > 0 && (
              <div>
                <span className="font-medium">Equipment: </span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {client.clientProfile.availableEquipment.map((eq) => (
                    <Badge key={eq} variant="outline" className="text-xs">{eq}</Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* At-a-glance adherence summary (full breakdown lives on the Sessions page) */}
      <ClientAdherenceSummary
        clientId={id}
        completionRate={adherence.completionRate}
        completed={adherence.completed}
        missedOrSkipped={adherence.missed + adherence.skipped}
        avgRPE={adherence.avgRPE}
        total={adherence.total}
      />

      {/* Tabbed content: Calendar (default), Programs, Messages */}
      <Tabs defaultValue="calendar">
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
                messages={threadMessages}
                currentUserId={user.id}
                recipientId={client.id}
                recipientName={`${client.firstName} ${client.lastName}`}
              />
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
