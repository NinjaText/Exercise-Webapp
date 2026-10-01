import { notFound } from "next/navigation";
import { requireRole } from "@/lib/current-user";
import { getClientDetail, getClientIdsForTrainer } from "@/lib/services/client.service";
import * as progressService from "@/lib/services/progress.service";
import * as noteService from "@/lib/services/clinical-note.service";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils/display-name";
import { PhotosTab } from "@/components/progress/photos-tab";
import { MetricsTab } from "@/components/progress/metrics-tab";
import { SoapNotesTab } from "@/components/progress/soap-notes-tab";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ClientProgressPage({ params }: Props) {
  const { id } = await params;
  const user = await requireRole("TRAINER");
  const clientIds = await getClientIdsForTrainer(user.id);
  if (!clientIds.includes(id)) notFound();
  const client = await getClientDetail(id);

  if (!client) notFound();

  // Fetch all progress data in parallel
  const [photos, metrics, metricTypes, notes] = await Promise.all([
    progressService.getProgressPhotos(client.id),
    progressService.getBodyMetrics(client.id),
    progressService.getBodyMetricTypes(client.id),
    noteService.getNotesForClient(client.id, user.id),
  ]);

  const clientName = `${client.firstName} ${client.lastName}`;

  return (
    <PageShell>
      <Tabs defaultValue="photos" className="gap-6">
        <PageHeader
          title="Progress tracking"
          description={`${photos.length} photos · ${metricTypes.length} metric types · ${notes.length} notes`}
          meta={
            <div className="flex min-w-0 items-center gap-3">
              <Avatar className="size-10">
                <AvatarImage src={client.imageUrl ?? undefined} alt="" />
                <AvatarFallback className="bg-brand-soft text-label text-brand-foreground">
                  {getInitials(client)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-label text-foreground">{clientName}</p>
                {client.email && <p className="truncate text-caption">{client.email}</p>}
              </div>
            </div>
          }
          back={{ label: "Back to client", href: `/clients/${id}` }}
          breadcrumb={[
            { label: "Clients", href: "/clients" },
            { label: clientName, href: `/clients/${id}` },
            { label: "Progress" },
          ]}
          tabs={
            <TabsList variant="line">
              <TabsTrigger value="photos">Progress photos ({photos.length})</TabsTrigger>
              <TabsTrigger value="metrics">Body metrics ({metricTypes.length})</TabsTrigger>
              <TabsTrigger value="notes">Clinical notes — SOAP ({notes.length})</TabsTrigger>
            </TabsList>
          }
        />

        <TabsContent value="photos">
          <PhotosTab photos={photos} clientId={client.id} />
        </TabsContent>

        <TabsContent value="metrics">
          <MetricsTab metrics={metrics} metricTypes={metricTypes} clientId={client.id} />
        </TabsContent>

        <TabsContent value="notes">
          <SoapNotesTab notes={notes} clientId={client.id} />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
