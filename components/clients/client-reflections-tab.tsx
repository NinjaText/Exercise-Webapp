import Link from "next/link";
import { format } from "date-fns";
import { CalendarClock, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/shared/section-card";
import { EmptyState } from "@/components/shared/empty-state";
import { toLocalCalendarDate } from "@/lib/utils/calendar-date";
import { REFLECTION_KIND_LABELS, type ReflectionKind } from "@/lib/reflections/constants";
import { SharedReflectionsList, type SharedReflectionView } from "@/components/reflections/shared-reflections-list";

export interface ClientUpcomingReflection {
  id: string;
  date: Date | null;
  kind: string;
  text: string;
  author: string | null;
}

/**
 * Trainer client-detail "Reflections" tab: what this client will see next and
 * what they chose to share. Private journal entries never reach this view.
 */
export function ClientReflectionsTab({
  upcoming,
  shared,
}: {
  upcoming: ClientUpcomingReflection[];
  shared: SharedReflectionView[];
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <SectionCard
        title="Upcoming reflections"
        icon={CalendarClock}
        count={upcoming.length}
        action={
          <Button size="sm" variant="outline" asChild>
            <Link href="/reflections">
              <Plus className="size-4" />
              Schedule
            </Link>
          </Button>
        }
      >
        {upcoming.length === 0 ? (
          <EmptyState
            size="compact"
            icon={Sparkles}
            title="Nothing scheduled"
            description="Without a scheduled one, the client sees their program's reflection or a library prompt."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {upcoming.map((reflection) => (
              <li key={reflection.id} className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="w-16 shrink-0 text-label text-muted-foreground tabular-nums">
                  {reflection.date ? format(toLocalCalendarDate(reflection.date), "MMM d") : ""}
                </span>
                <div className="min-w-0">
                  <p className="text-caption font-medium text-muted-foreground">
                    {REFLECTION_KIND_LABELS[reflection.kind as ReflectionKind] ?? reflection.kind}
                  </p>
                  <p className="text-body text-foreground">{reflection.text}</p>
                  {reflection.author && <p className="text-caption text-muted-foreground">— {reflection.author}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Shared with you" icon={Sparkles} count={shared.length}>
        <SharedReflectionsList entries={shared} showClient={false} />
      </SectionCard>
    </div>
  );
}
