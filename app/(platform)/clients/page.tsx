import { Suspense } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/current-user";
import { getClientsForTrainer } from "@/lib/services/client.service";
import { getOrgInvitations } from "@/lib/services/invitation.service";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, ChevronRight, Mail } from "lucide-react";
import { AddClientDialog } from "@/components/clients/add-client-dialog";
import { ClientSearch } from "@/components/clients/client-search";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { InvitationsTable } from "@/components/shared/invitations-table";

interface Props {
  searchParams: Promise<{ q?: string }>;
}

// Generate a consistent gradient from the first letter
const avatarGradients = [
  "from-blue-400 to-indigo-500",
  "from-violet-400 to-purple-500",
  "from-emerald-400 to-teal-500",
  "from-rose-400 to-pink-500",
  "from-amber-400 to-orange-500",
  "from-cyan-400 to-blue-500",
];

function getAvatarGradient(name: string) {
  const idx = name.charCodeAt(0) % avatarGradients.length;
  return avatarGradients[idx];
}

export default async function ClientsPage({ searchParams }: Props) {
  const user = await requireRole("TRAINER");
  const { q } = await searchParams;
  const [allClients, invitations] = await Promise.all([
    getClientsForTrainer(user.id),
    user.clerkOrgId ? getOrgInvitations(user.clerkOrgId) : Promise.resolve([]),
  ]);

  const clients = q
    ? allClients.filter((p) => {
        const full = `${p.firstName} ${p.lastName} ${p.email}`.toLowerCase();
        return full.includes(q.toLowerCase());
      })
    : allClients;

  const pendingCount = invitations.filter((i) => i.status === "pending").length;

  return (
    <div className="space-y-8">
      <div>
        <PageHeader
          title="Clients"
          description={`${allClients.length} client${allClients.length !== 1 ? "s" : ""} in your organization`}
          action={<AddClientDialog />}
        />
      </div>

      <Tabs defaultValue="clients">
        <TabsList>
          <TabsTrigger value="clients">Clients</TabsTrigger>
          <TabsTrigger value="invitations">
            Invitations{pendingCount > 0 ? ` (${pendingCount})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="clients" className="space-y-6 mt-6">
          <Suspense fallback={<Skeleton className="h-10 w-full max-w-sm" />}>
            <ClientSearch />
          </Suspense>

          {clients.length === 0 ? (
            <EmptyState
              icon={Users}
              title={q ? "No clients match your search" : "No clients yet"}
              description={
                q
                  ? `No results for "${q}". Try a different name or email.`
                  : 'Click "Invite Client" above to send an invitation. The client will receive an email to join your organization.'
              }
            />
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {clients.map((client) => {
                const gradient = getAvatarGradient(client.firstName);
                const initials = `${client.firstName[0]}${client.lastName[0]}`;

                return (
                  <Link key={client.id} href={`/clients/${client.id}`}>
                    <Card className="group border-0 shadow-sm ring-1 ring-border/50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:ring-border">
                      <CardContent className="flex items-center gap-4 p-6">
                        <Avatar className="h-12 w-12 shrink-0 ring-2 ring-white shadow-md">
                          <AvatarImage src={client.imageUrl || undefined} />
                          <AvatarFallback
                            className={`bg-linear-to-br ${gradient} text-sm font-bold text-white`}
                          >
                            {initials}
                          </AvatarFallback>
                        </Avatar>

                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold leading-tight transition-colors group-hover:text-primary">
                            {client.firstName} {client.lastName}
                          </p>
                          <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                            <Mail className="h-3 w-3 shrink-0" />
                            {client.email}
                          </p>
                          {/* Role badge */}
                          <Badge
                            variant="outline"
                            className="mt-2 h-5 border-border/60 px-1.5 text-[10px] font-medium text-muted-foreground"
                          >
                            Client
                          </Badge>
                        </div>

                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="invitations" className="mt-6">
          <InvitationsTable invitations={invitations} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
