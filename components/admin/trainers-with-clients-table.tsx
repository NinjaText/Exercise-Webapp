"use client";

import React, { useState } from "react";
import Image from "next/image";
import { format } from "date-fns";
import { ChevronRight, ChevronDown, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { TrainerWithClients } from "@/lib/services/admin.service";
import { UserActionsMenu } from "@/components/admin/user-actions-menu";
import { AdminBulkInviteDialog } from "@/components/admin/admin-bulk-invite-dialog";
import { AdminInvitationsDialog } from "@/components/admin/admin-invitations-dialog";

interface Props {
  trainers: TrainerWithClients[];
}

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

  if (trainers.length === 0) {
    return (
      <div className="px-5 py-12 text-center">
        <Users className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
        <p className="text-sm text-muted-foreground">No trainers found.</p>
      </div>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border">
          <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">User</th>
          <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Role</th>
          <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden lg:table-cell">Status</th>
          <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Joined</th>
          <th className="px-5 py-3 w-10" />
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {trainers.map((trainer) => {
          const isExpanded = expanded.has(trainer.id);
          return (
            <React.Fragment key={trainer.id}>
              {/* Trainer row */}
              <tr
                className={`hover:bg-muted/40 transition-colors ${!trainer.isActive ? "opacity-50" : ""}`}
              >
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(trainer.id)}
                      className="shrink-0 text-muted-foreground hover:text-foreground"
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
                </td>
                <td className="px-5 py-3">
                  <Badge variant="secondary" className="text-[10px]">
                    Trainer · {trainer.clients.length} client{trainer.clients.length !== 1 ? "s" : ""}
                  </Badge>
                </td>
                <td className="px-5 py-3 hidden lg:table-cell">
                  {trainer.isActive ? (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" /> Archived
                    </span>
                  )}
                </td>
                <td className="px-5 py-3 text-xs text-muted-foreground">
                  {format(new Date(trainer.createdAt), "MMM d, yyyy")}
                </td>
                <td className="px-5 py-3">
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
                </td>
              </tr>

              {/* Client sub-rows */}
              {isExpanded && trainer.clients.map((client) => (
                <tr
                  key={`${trainer.id}-${client.id}`}
                  className={`bg-muted/20 hover:bg-muted/40 transition-colors ${!client.isActive ? "opacity-50" : ""}`}
                >
                  <td className="py-2.5 pr-5" style={{ paddingLeft: "3.5rem" }}>
                    <div className="flex items-center gap-3">
                      <div className="w-px h-4 bg-border shrink-0" />
                      <UserAvatar imageUrl={client.imageUrl} firstName={client.firstName} lastName={client.lastName} />
                      <div className="min-w-0">
                        <p className={`font-medium text-sm truncate ${!client.isActive ? "italic text-muted-foreground" : "text-foreground"}`}>
                          {client.firstName} {client.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{client.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-2.5">
                    <Badge variant="secondary" className="text-[10px]">
                      Client
                    </Badge>
                  </td>
                  <td className="px-5 py-2.5 hidden lg:table-cell">
                    {client.isActive ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" /> Archived
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-2.5 text-xs text-muted-foreground">
                    {format(new Date(client.createdAt), "MMM d, yyyy")}
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <UserActionsMenu
                      userId={client.id}
                      isActive={client.isActive}
                      userName={`${client.firstName} ${client.lastName}`}
                    />
                  </td>
                </tr>
              ))}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
