import { Suspense } from "react";
import { requireRole } from "@/lib/current-user";
import { getClientsForTrainer } from "@/lib/services/client.service";
import { getTrainerCoachingStatuses } from "@/lib/clubs/trainer-coaching";
import { COACHING_BADGE } from "@/lib/ui/status";
import { getOrgInvitations } from "@/lib/services/invitation.service";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users } from "lucide-react";
import { AddClientDialog } from "@/components/clients/add-client-dialog";
import { ClientSearch } from "@/components/clients/client-search";
import { ClientArchivedToggle } from "@/components/clients/client-archived-toggle";
import { ClientActionsMenu } from "@/components/clients/client-actions-menu";
import { ClientCardList } from "@/components/clients/client-card-list";
import { PageHeader } from "@/components/shared/page-header";
import { PageShell } from "@/components/shared/page-shell";
import { PageToolbar } from "@/components/shared/page-toolbar";
import { DataList, type Column } from "@/components/shared/data-list";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { InvitationsTable } from "@/components/shared/invitations-table";
import { getDisplayName, getInitials } from "@/lib/utils/display-name";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface Props {
  searchParams: Promise<{ q?: string; archived?: string }>;
}

type ClientRow = Awaited<ReturnType<typeof getClientsForTrainer>>[number];

function buildClientColumns(coaching: Record<string, string> | null): Column<ClientRow>[] {
  const columns: Column<ClientRow>[] = [
  {
    key: "name",
    header: "Client",
    render: (c) => (
      <div className="flex items-center gap-3">
        <Avatar className="size-8">
          <AvatarImage src={c.imageUrl || undefined} />
          <AvatarFallback className="bg-brand-soft text-xs font-semibold text-brand-foreground">
            {getInitials(c)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className={cn("truncate text-label text-foreground", c.isActive === false && "text-muted-foreground")}>
            {getDisplayName(c)}
          </p>
          {getDisplayName(c) !== c.email && (
            <p className="truncate text-caption">{c.email}</p>
          )}
        </div>
      </div>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (c) => <StatusBadge status={c.isActive === false ? "INACTIVE" : "ACTIVE"} size="sm" />,
  },
  ...(coaching
    ? [
        {
          key: "coaching",
          header: "Coaching",
          render: (c: ClientRow) => {
            const badge = COACHING_BADGE[coaching[c.id]];
            return badge ? (
              <StatusBadge status={coaching[c.id]} label={badge.label} role={badge.role} size="sm" />
            ) : null;
          },
        },
      ]
    : []),
  {
    key: "joined",
    header: "Joined",
    align: "right",
    render: (c) => format(c.createdAt, "MMM d, yyyy"),
  },
  {
    key: "actions",
    header: "",
    className: "w-12",
    render: (c) => (
      <div className="relative z-10 flex justify-end">
        <ClientActionsMenu clientId={c.id} isActive={c.isActive !== false} />
      </div>
    ),
  },
  ];
  return columns;
}

export default async function ClientsPage({ searchParams }: Props) {
  const user = await requireRole("TRAINER");
  const { q, archived } = await searchParams;
  const showArchived = archived === "1";
  const [allClients, invitations, coaching] = await Promise.all([
    getClientsForTrainer(user.id),
    user.clerkOrgId ? getOrgInvitations(user.clerkOrgId) : Promise.resolve([]),
    // null (and no coaching query) unless this is a club trainer.
    getTrainerCoachingStatuses(user),
  ]);

  const scopedClients = allClients.filter((p) => showArchived ? p.isActive === false : p.isActive !== false);

  const clients = q
    ? scopedClients.filter((p) => {
        const full = `${p.firstName} ${p.lastName} ${p.email}`.toLowerCase();
        return full.includes(q.toLowerCase());
      })
    : scopedClients;

  const emptyState = (
    <EmptyState
      size="compact"
      icon={Users}
      title={q ? "No clients match your search" : showArchived ? "No inactive clients" : "No clients yet"}
      description={
        q
          ? `No results for "${q}". Try a different name or email.`
          : showArchived
          ? "Clients marked inactive will show up here."
          : 'Click "Invite Client" above to send an invitation. The client will receive an email to join your organization.'
      }
    />
  );

  const pendingCount = invitations.filter((i) => i.status === "pending").length;

  return (
    <PageShell>
      <Tabs defaultValue="clients" className="gap-6">
        <PageHeader
          title="Clients"
          description={`${scopedClients.length} ${showArchived ? "inactive" : "active"} client${scopedClients.length !== 1 ? "s" : ""} in your organization`}
          primaryAction={<AddClientDialog />}
          tabs={
            <TabsList variant="line">
              <TabsTrigger value="clients">Clients</TabsTrigger>
              <TabsTrigger value="invitations">
                Invitations{pendingCount > 0 ? ` (${pendingCount})` : ""}
              </TabsTrigger>
            </TabsList>
          }
        />

        <TabsContent value="clients" className="flex flex-col gap-4">
          <PageToolbar
            end={
              <Suspense fallback={null}>
                <ClientArchivedToggle />
              </Suspense>
            }
          >
            <Suspense fallback={<Skeleton className="h-9 w-full max-w-sm" />}>
              <ClientSearch />
            </Suspense>
          </PageToolbar>

          <div className="sm:hidden">
            <ClientCardList clients={clients} coaching={coaching} emptyState={emptyState} />
          </div>
          <div className="hidden sm:block">
            <DataList
              columns={buildClientColumns(coaching)}
              data={clients}
              keyExtractor={(c) => c.id}
              rowHref={(c) => `/clients/${c.id}`}
              emptyState={emptyState}
            />
          </div>
        </TabsContent>

        <TabsContent value="invitations">
          <InvitationsTable invitations={invitations} />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
