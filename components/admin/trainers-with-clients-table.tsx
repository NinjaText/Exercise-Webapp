"use client";

import { useState } from "react";
import Image from "next/image";
import { format } from "date-fns";
import { ChevronRight, ChevronDown, Users } from "lucide-react";
import { DataList, type Column } from "@/components/shared/data-list";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import type { TrainerWithClients } from "@/lib/services/admin.service";
import { UserActionsMenu } from "@/components/admin/user-actions-menu";
import { AdminBulkInviteDialog } from "@/components/admin/admin-bulk-invite-dialog";
import { AdminInvitationsDialog } from "@/components/admin/admin-invitations-dialog";

interface Props {
  trainers: TrainerWithClients[];
}

type ClientOf = TrainerWithClients["clients"][number];

type Row =
  | { kind: "trainer"; trainer: TrainerWithClients }
  | { kind: "client"; trainerId: string; client: ClientOf };

function UserAvatar({ imageUrl, firstName, lastName }: { imageUrl: string | null; firstName: string; lastName: string }) {
  return (
    <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted overflow-hidden">
      {imageUrl ? (
        <Image src={imageUrl} alt="" fill className="object-cover" />
      ) : (
        <span className="text-xs font-bold text-muted-foreground">
          {firstName[0]}{lastName[0]}
        </span>
      )}
    </div>
  );
}

export function TrainersWithClientsTable({ trainers }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(trainers.map((t) => t.id))
  );

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const rows: Row[] = trainers.flatMap((trainer) => {
    const trainerRow: Row = { kind: "trainer", trainer };
    if (!expanded.has(trainer.id)) return [trainerRow];
    const clientRows: Row[] = trainer.clients.map((client) => ({
      kind: "client",
      trainerId: trainer.id,
      client,
    }));
    return [trainerRow, ...clientRows];
  });

  const columns: Column<Row>[] = [
    {
      key: "user",
      header: "User",
      render: (row) => {
        if (row.kind === "trainer") {
          const { trainer } = row;
          const isExpanded = expanded.has(trainer.id);
          return (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => toggleExpanded(trainer.id)}
                className="shrink-0 text-muted-foreground hover:text-foreground"
                aria-label={isExpanded ? "Collapse clients" : "Expand clients"}
              >
                {isExpanded
                  ? <ChevronDown className="h-4 w-4" />
                  : <ChevronRight className="h-4 w-4" />}
              </button>
              <UserAvatar imageUrl={trainer.imageUrl} firstName={trainer.firstName} lastName={trainer.lastName} />
              <div className="min-w-0">
                <p className={`font-medium truncate ${!trainer.isActive ? "italic text-muted-foreground" : "text-foreground"}`}>
                  {trainer.firstName} {trainer.lastName}
                </p>
                <p className="text-xs text-muted-foreground truncate">{trainer.email}</p>
              </div>
            </div>
          );
        }
        const { client } = row;
        return (
          <div className="flex items-center gap-3 pl-9">
            <div className="w-px h-4 bg-border shrink-0" />
            <UserAvatar imageUrl={client.imageUrl} firstName={client.firstName} lastName={client.lastName} />
            <div className="min-w-0">
              <p className={`font-medium text-sm truncate ${!client.isActive ? "italic text-muted-foreground" : "text-foreground"}`}>
                {client.firstName} {client.lastName}
              </p>
              <p className="text-xs text-muted-foreground truncate">{client.email}</p>
            </div>
          </div>
        );
      },
    },
    {
      key: "role",
      header: "Role",
      render: (row) =>
        row.kind === "trainer" ? (
          <StatusBadge
            status="TRAINER"
            dot={false}
            size="sm"
            label={`Trainer · ${row.trainer.clients.length} client${row.trainer.clients.length !== 1 ? "s" : ""}`}
          />
        ) : (
          <StatusBadge status="CLIENT" dot={false} size="sm" label="Client" />
        ),
    },
    {
      key: "status",
      header: "Status",
      className: "hidden lg:table-cell",
      render: (row) => {
        const isActive = row.kind === "trainer" ? row.trainer.isActive : row.client.isActive;
        return <StatusBadge status={isActive ? "ACTIVE" : "ARCHIVED"} size="sm" />;
      },
    },
    {
      key: "joined",
      header: "Joined",
      render: (row) => {
        const createdAt = row.kind === "trainer" ? row.trainer.createdAt : row.client.createdAt;
        return <span className="text-xs text-muted-foreground">{format(new Date(createdAt), "MMM d, yyyy")}</span>;
      },
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => {
        if (row.kind === "trainer") {
          const { trainer } = row;
          return (
            <div className="flex items-center justify-end gap-1">
              {trainer.clerkOrgId && (
                <>
                  <AdminInvitationsDialog
                    clerkOrgId={trainer.clerkOrgId}
                    trainerName={`${trainer.firstName} ${trainer.lastName}`}
                  />
                  <AdminBulkInviteDialog
                    clerkOrgId={trainer.clerkOrgId}
                    trainerName={`${trainer.firstName} ${trainer.lastName}`}
                  />
                </>
              )}
              <UserActionsMenu
                userId={trainer.id}
                isActive={trainer.isActive}
                userName={`${trainer.firstName} ${trainer.lastName}`}
              />
            </div>
          );
        }
        const { client } = row;
        return (
          <div className="flex items-center justify-end">
            <UserActionsMenu
              userId={client.id}
              isActive={client.isActive}
              userName={`${client.firstName} ${client.lastName}`}
            />
          </div>
        );
      },
    },
  ];

  return (
    <DataList
      columns={columns}
      data={rows}
      keyExtractor={(row) => (row.kind === "trainer" ? row.trainer.id : `${row.trainerId}-${row.client.id}`)}
      density="compact"
      emptyState={
        <EmptyState icon={Users} title="No trainers found" size="compact" />
      }
    />
  );
}
