import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ClientAdherenceRow {
  clientId: string;
  firstName: string;
  lastName: string;
  imageUrl: string | null;
  adherencePct: number | null;
  mealsLogged: number;
  avgAdherence7d: number | null;
  avgWaterAdherence7d: number | null;
}

interface ClientRosterAdherenceProps {
  clients: ClientAdherenceRow[];
}

function adherenceColor(pct: number | null) {
  if (pct === null) return "text-muted-foreground";
  if (pct >= 85) return "text-emerald-500";
  if (pct >= 60) return "text-amber-500";
  return "text-destructive";
}

export function ClientRosterAdherence({ clients }: ClientRosterAdherenceProps) {
  if (clients.length === 0) {
    return <p className="text-sm text-muted-foreground">No clients yet.</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-border/50">
      <div className="flex items-center justify-between gap-4 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
        <span>Client</span>
        <span className="flex items-center gap-6 pr-8">
          <span className="w-10 text-right">7-day</span>
          <span className="w-10 text-right">Today</span>
        </span>
      </div>
      <div className="divide-y divide-border/50 border-t border-border/50">
        {clients.map((client) => (
          <Link
            key={client.clientId}
            href={`/nutrition/${client.clientId}`}
            className="flex items-center justify-between gap-4 px-4 py-2.5 transition-colors hover:bg-muted/40"
          >
            <div className="flex min-w-0 items-center gap-3">
              {client.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={client.imageUrl}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded-full object-cover bg-muted"
                />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                  {client.firstName[0]}
                  {client.lastName[0]}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium leading-tight">
                  {client.firstName} {client.lastName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {client.mealsLogged} meal{client.mealsLogged !== 1 ? "s" : ""} today
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-6">
              <span className={cn("w-10 text-right text-sm font-semibold tabular-nums", adherenceColor(client.avgAdherence7d))}>
                {client.avgAdherence7d === null ? "—" : `${client.avgAdherence7d}%`}
              </span>
              <span className={cn("w-10 text-right text-sm font-semibold tabular-nums", adherenceColor(client.adherencePct))}>
                {client.adherencePct === null ? "—" : `${client.adherencePct}%`}
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
