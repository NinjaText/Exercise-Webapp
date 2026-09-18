import { UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";
import { DataList, type Column } from "@/components/shared/data-list";
import { EmptyState } from "@/components/shared/empty-state";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getDisplayName, getInitials } from "@/lib/utils/display-name";
import type { StatusRole } from "@/lib/ui/status";

interface ClientAdherenceRow {
  clientId: string;
  firstName: string;
  lastName: string;
  email: string;
  imageUrl: string | null;
  adherencePct: number | null;
  mealsLogged: number;
  avgAdherence7d: number | null;
  avgWaterAdherence7d: number | null;
}

interface ClientRosterAdherenceProps {
  clients: ClientAdherenceRow[];
}

function adherenceRole(pct: number | null): StatusRole {
  if (pct === null) return "neutral";
  if (pct >= 85) return "success";
  if (pct >= 60) return "warning";
  return "danger";
}

const ADHERENCE_TEXT_CLASS: Record<StatusRole, string> = {
  success: "text-success-foreground",
  warning: "text-warning-foreground",
  danger: "text-danger-foreground",
  neutral: "text-muted-foreground",
  info: "text-info-foreground",
  brand: "text-brand-foreground",
};

function AdherenceCell({ pct }: { pct: number | null }) {
  return (
    <span className={cn("font-semibold tabular-nums", ADHERENCE_TEXT_CLASS[adherenceRole(pct)])}>
      {pct === null ? "—" : `${pct}%`}
    </span>
  );
}

const columns: Column<ClientAdherenceRow>[] = [
  {
    key: "client",
    header: "Client",
    render: (client) => {
      const displayName = getDisplayName(client);
      return (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="size-8">
            <AvatarImage src={client.imageUrl ?? undefined} alt="" />
            <AvatarFallback>{getInitials(client)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-tight">{displayName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {client.mealsLogged} meal{client.mealsLogged !== 1 ? "s" : ""} today
            </p>
          </div>
        </div>
      );
    },
  },
  {
    key: "avgAdherence7d",
    header: "7-day",
    align: "right",
    render: (client) => <AdherenceCell pct={client.avgAdherence7d} />,
  },
  {
    key: "adherencePct",
    header: "Today",
    align: "right",
    render: (client) => <AdherenceCell pct={client.adherencePct} />,
  },
];

export function ClientRosterAdherence({ clients }: ClientRosterAdherenceProps) {
  return (
    <DataList
      columns={columns}
      data={clients}
      keyExtractor={(client) => client.clientId}
      rowHref={(client) => `/nutrition/${client.clientId}`}
      emptyState={<EmptyState size="compact" icon={UtensilsCrossed} title="No clients yet" />}
    />
  );
}
