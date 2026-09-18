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
    <SectionCard
      title="Resources"
      icon={Library}
      action={{ label: "View all", href: "/programs?type=resources" }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {resources.slice(0, MAX_RESOURCES).map((resource) => (
          <ResourceCard key={resource.id} resource={resource} />
        ))}
      </div>
    </SectionCard>
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
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-foreground">
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
