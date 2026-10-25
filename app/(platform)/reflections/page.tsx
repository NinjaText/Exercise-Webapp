import { requireRole } from "@/lib/current-user";
import { getClientsForTrainer } from "@/lib/services/client.service";
import { filterCoachableClientIds } from "@/lib/org-capabilities.server";
import * as reflectionService from "@/lib/services/reflection.service";
import * as journalService from "@/lib/services/journal.service";
import { getDisplayName } from "@/lib/utils/display-name";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateReflectionFlow } from "@/components/reflections/create-reflection-flow";
import { ProgramPlansPanel } from "@/components/reflections/program-plans-panel";
import { ScheduledReflectionsPanel } from "@/components/reflections/scheduled-reflections-panel";
import { SharedReflectionsList } from "@/components/reflections/shared-reflections-list";

export const metadata = { title: "Reflections" };

const REFLECTION_TABS = ["create", "plans", "scheduled", "shared"] as const;
type ReflectionTab = (typeof REFLECTION_TABS)[number];

interface Props {
  searchParams?: Promise<{ tab?: string }>;
}

export default async function ReflectionsPage({ searchParams }: Props) {
  const user = await requireRole("TRAINER");
  const { tab } = (await searchParams) ?? {};
  const initialTab: ReflectionTab = REFLECTION_TABS.includes(tab as ReflectionTab) ? (tab as ReflectionTab) : "create";

  const [clients, programs, shared] = await Promise.all([
    getClientsForTrainer(user.id),
    reflectionService.listPlanPrograms(user.id),
    journalService.listSharedEntriesForTrainer(user.id),
  ]);
  const rosterIds = clients.map((client) => client.id);
  // Scheduling targets only clients this trainer may coach (a club house coach
  // can't reach uncoached members); the Scheduled list covers the whole roster.
  const [coachableIds, upcoming] = await Promise.all([
    filterCoachableClientIds(user, rosterIds),
    reflectionService.listUpcomingClientReflections(user.id, new Date(), rosterIds),
  ]);
  const coachable = new Set(coachableIds);

  const clientNameById = new Map(clients.map((client) => [client.id, getDisplayName(client)]));
  const pickerClients = clients
    .filter((client) => coachable.has(client.id))
    .map((client) => ({ id: client.id, name: getDisplayName(client) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <PageShell>
      <Tabs defaultValue={initialTab} className="gap-6">
        <PageHeader
          title="Reflections"
          description="Daily quotes, questions and prompts that appear on your clients' dashboards."
          tabs={
            <TabsList variant="line">
              <TabsTrigger value="create">Create</TabsTrigger>
              <TabsTrigger value="plans">Program plans</TabsTrigger>
              <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
              <TabsTrigger value="shared">Shared with me{shared.length > 0 ? ` (${shared.length})` : ""}</TabsTrigger>
            </TabsList>
          }
        />

        <TabsContent value="create">
          <CreateReflectionFlow clients={pickerClients} programs={programs} />
        </TabsContent>

        <TabsContent value="plans">
          <ProgramPlansPanel programs={programs} />
        </TabsContent>

        <TabsContent value="scheduled">
          <ScheduledReflectionsPanel
            rows={upcoming.map((row) => ({ ...row, date: row.date.toISOString() }))}
          />
        </TabsContent>

        <TabsContent value="shared">
          <SharedReflectionsList
            entries={shared.map((entry) => ({
              id: entry.id,
              clientId: entry.clientId,
              clientName: clientNameById.get(entry.clientId) ?? "Former client",
              promptText: entry.promptText,
              promptAuthor: entry.promptAuthor,
              body: entry.body,
              createdAt: entry.createdAt,
            }))}
          />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
