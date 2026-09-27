import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ClientActionsMenu } from "@/components/clients/client-actions-menu";
import { StatusBadge } from "@/components/shared/status-badge";
import { COACHING_BADGE } from "@/lib/ui/status";
import { getDisplayName, getInitials } from "@/lib/utils/display-name";
import { cn } from "@/lib/utils";

export interface ClientCardItem {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  imageUrl: string | null;
  isActive: boolean | null;
}

interface ClientCardListProps {
  clients: ClientCardItem[];
  /** Club trainers only: coaching status by client id (null elsewhere). */
  coaching?: Record<string, string> | null;
  /** Rendered in place of the list when there are no clients. */
  emptyState?: React.ReactNode;
}

/**
 * Phone form of the clients table: one tappable row per client. The link is
 * stretched over the row (`after:absolute after:inset-0`), so the actions
 * menu sits beside it with `relative z-10` to stay clickable, the same
 * convention as DataList.
 */
export function ClientCardList({ clients, coaching = null, emptyState }: ClientCardListProps) {
  if (clients.length === 0) {
    return <div className="rounded-xl bg-card ring-1 ring-border">{emptyState}</div>;
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl bg-card ring-1 ring-border">
      {clients.map((c) => {
        const name = getDisplayName(c);
        const inactive = c.isActive === false;
        return (
          <li key={c.id} className="relative flex min-h-14 items-center gap-2 py-2 pl-4 pr-2">
            <Link
              href={`/clients/${c.id}`}
              className="flex min-w-0 flex-1 items-center gap-3 after:absolute after:inset-0 after:content-['']"
            >
              <Avatar className="size-8 shrink-0">
                <AvatarImage src={c.imageUrl || undefined} />
                <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                  {getInitials(c)}
                </AvatarFallback>
              </Avatar>
              <span className={cn("min-w-0 flex-1 truncate text-sm font-medium", inactive && "text-muted-foreground")}>
                {name}
              </span>
              {coaching?.[c.id] && COACHING_BADGE[coaching[c.id]] ? (
                <StatusBadge
                  status={coaching[c.id]}
                  label={COACHING_BADGE[coaching[c.id]].label}
                  role={COACHING_BADGE[coaching[c.id]].role}
                  size="sm"
                />
              ) : (
                <StatusBadge status={inactive ? "INACTIVE" : "ACTIVE"} size="sm" />
              )}
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
            <div className="relative z-10 shrink-0">
              <ClientActionsMenu clientId={c.id} isActive={!inactive} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
