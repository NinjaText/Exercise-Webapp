"use client";

import Link from "next/link";
import { ChevronRight, Sparkles } from "lucide-react";
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

/** Deliberately small: the dashboard is meant to fit one viewport. */
const MAX_RESOURCES = 3;

/**
 * Shortcut into the client's On-Demand ("Resource") programs — warm-ups,
 * mobility, recovery. Renders nothing when the client has none, rather than an
 * empty-state card, so a client who was never given Resources never sees a
 * section that can't do anything for them.
 */
export function QuickResourcesRow({ resources }: { resources: QuickResourceItem[] }) {
  if (resources.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-600" />
          <h2 className="text-base font-semibold">Quick Resources</h2>
        </div>
        <Link
          href="/programs?type=resources"
          className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
        >
          View All <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {resources.slice(0, MAX_RESOURCES).map((resource) => (
          <ResourceCard key={resource.id} resource={resource} />
        ))}
      </div>
    </section>
  );
}

function ResourceCard({ resource }: { resource: QuickResourceItem }) {
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
      className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3.5 shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/40"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600">
        <Icon className="h-5 w-5" />
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
