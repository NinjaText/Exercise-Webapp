"use client";

import Link from "next/link";
import { Library } from "lucide-react";
import { SectionCard } from "@/components/shared/section-card";
import { getProgramCategoryVisual } from "@/lib/utils/program-visual";

export interface QuickResourceItem {
  id: string;
  name: string;
  workoutCount: number;
  estimatedMinutes: number | null;
  tags: string[];
  activities: string[];
  goals: string[];
  bodyAreas: string[];
}

/**
 * Capped so the dashboard still fits one screen — the card sits beside the
 * Inbox, and past ~6 rows the two columns stop reading as a pair.
 */
const MAX_RESOURCES = 6;

/**
 * Shortcut into the client's On-Demand ("Resource") programs — warm-ups,
 * mobility, recovery. Renders nothing when the client has none, rather than an
 * empty-state card, so a client who was never given Resources never sees a
 * section that can't do anything for them.
 */
export function QuickResourcesList({
  resources,
  className,
}: {
  resources: QuickResourceItem[];
  className?: string;
}) {
  if (resources.length === 0) return null;

  return (
    <SectionCard
      title="Resources"
      icon={Library}
      action={{ label: "View all", href: "/programs?type=resources" }}
      className={className}
    >
      <div className="space-y-2">
        {resources.slice(0, MAX_RESOURCES).map((resource) => (
          <ResourceRow key={resource.id} resource={resource} />
        ))}
      </div>
    </SectionCard>
  );
}

function ResourceRow({ resource }: { resource: QuickResourceItem }) {
  const { icon: Icon, label } = getProgramCategoryVisual(resource);

  const meta = [
    `${resource.workoutCount} ${resource.workoutCount === 1 ? "workout" : "workouts"}`,
    resource.estimatedMinutes != null ? `~${resource.estimatedMinutes} min` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={`/programs/${resource.id}`}
      className="flex items-center gap-3 rounded-xl border border-border/60 p-2.5 transition-colors hover:border-primary/40 hover:bg-muted/30"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-foreground">
        <Icon className="size-4.5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{resource.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {label} · {meta}
        </span>
      </span>
    </Link>
  );
}
