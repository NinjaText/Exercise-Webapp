"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Download, Loader2, Search, UserRound, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AUDIT_ACTION_CATALOG,
  AUDIT_CATEGORIES,
  AUDIT_DATE_RANGES,
  actionsInCategory,
  auditFiltersToQuery,
  type AuditActorTypeKey,
  type AuditCategory,
  type AuditLogFilterState,
} from "@/lib/audit/catalog";

const ALL = "ALL";

const ROLE_TAB_LABELS: Record<AuditActorTypeKey, string> = {
  CLIENT: "Clients",
  TRAINER: "Trainers",
  SUPER_ADMIN: "Admins",
  SYSTEM: "System",
};

interface AuditLogFiltersProps {
  filters: AuditLogFilterState;
  /** Entry counts per actor type under the other active filters — shown on the role tabs. */
  roleCounts: Record<AuditActorTypeKey, number>;
  /** clerkOrgId → name. Omit to hide the organization filter (clinic-scoped pages). */
  orgNames?: Record<string, string>;
  /** Display name for the `actor` filter, when one is active. */
  actorName?: string;
  /** Endpoint that streams the filtered log as CSV. */
  exportHref: string;
  /** Which actor types this page can show; SYSTEM and admin rows are hidden from clinics. */
  roles: AuditActorTypeKey[];
}

export function AuditLogFilters({
  filters,
  roleCounts,
  orgNames,
  actorName,
  exportHref,
  roles,
}: AuditLogFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(filters.q ?? "");

  // Keep the box in sync when the URL changes underneath it (back/forward, clear all).
  useEffect(() => setSearch(filters.q ?? ""), [filters.q]);

  function apply(patch: Partial<AuditLogFilterState>) {
    // Any filter change starts over at page 1.
    const query = auditFiltersToQuery({ ...filters, ...patch, page: 1 });
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }

  // Debounced search-as-you-type.
  useEffect(() => {
    const next = search.trim();
    if (next === (filters.q ?? "")) return;
    const t = setTimeout(() => apply({ q: next || undefined }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply closes over the latest filters each render
  }, [search, filters.q]);

  const actionOptions = filters.category
    ? actionsInCategory(filters.category)
    : (Object.keys(AUDIT_ACTION_CATALOG) as (keyof typeof AUDIT_ACTION_CATALOG)[]);

  const categoryItems: Record<string, string> = { [ALL]: "All categories", ...AUDIT_CATEGORIES };
  const actionItems: Record<string, string> = { [ALL]: "All actions" };
  for (const [key, meta] of Object.entries(AUDIT_ACTION_CATALOG)) actionItems[key] = meta.label;
  const rangeItems: Record<string, string> = { [ALL]: "All time" };
  for (const [key, r] of Object.entries(AUDIT_DATE_RANGES)) rangeItems[key] = r.label;
  const orgItems: Record<string, string> = { [ALL]: "All organizations", ...(orgNames ?? {}) };
  const sortedOrgs = Object.entries(orgNames ?? {}).sort((a, b) => a[1].localeCompare(b[1]));

  const activeCount = [filters.q, filters.category, filters.action, filters.org, filters.actor, filters.range]
    .filter(Boolean).length;
  const total = roles.reduce((sum, r) => sum + roleCounts[r], 0);
  const exportQuery = auditFiltersToQuery({ ...filters, page: 1 });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={filters.role ?? ALL}
          onValueChange={(v) => apply({ role: v === ALL ? undefined : (v as AuditActorTypeKey) })}
        >
          <TabsList className="h-9">
            <TabsTrigger value={ALL} className="px-3">
              All <Count n={total} />
            </TabsTrigger>
            {roles.map((r) => (
              <TabsTrigger key={r} value={r} className="px-3">
                {ROLE_TAB_LABELS[r]} <Count n={roleCounts[r]} />
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading" />}
          <Button variant="outline" size="sm" className="h-9" asChild>
            <a href={exportQuery ? `${exportHref}?${exportQuery}` : exportHref} download>
              <Download className="h-4 w-4" />
              Export CSV
            </a>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search user or target…"
            className="h-9 pl-9"
            aria-label="Search audit log"
          />
        </div>

        <Select
          value={filters.category ?? ALL}
          items={categoryItems}
          onValueChange={(v) => {
            const category = v === ALL || !v ? undefined : (v as AuditCategory);
            // Drop an action that doesn't belong to the newly chosen category.
            const keepAction =
              filters.action && category && actionsInCategory(category).includes(filters.action as never);
            apply({ category, action: keepAction ? filters.action : undefined });
          }}
        >
          <SelectTrigger className="h-9 w-48" aria-label="Category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            <SelectSeparator />
            {Object.entries(AUDIT_CATEGORIES).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.action ?? ALL}
          items={actionItems}
          onValueChange={(v) => apply({ action: v === ALL || !v ? undefined : String(v) })}
        >
          <SelectTrigger className="h-9 w-56" aria-label="Action">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            <SelectItem value={ALL}>All actions</SelectItem>
            {(filters.category ? [filters.category] : (Object.keys(AUDIT_CATEGORIES) as AuditCategory[])).map((cat) => {
              const inCat = actionOptions.filter((a) => AUDIT_ACTION_CATALOG[a].category === cat);
              if (inCat.length === 0) return null;
              return (
                <SelectGroup key={cat}>
                  <SelectSeparator />
                  <SelectLabel>{AUDIT_CATEGORIES[cat]}</SelectLabel>
                  {inCat.map((a) => (
                    <SelectItem key={a} value={a}>{AUDIT_ACTION_CATALOG[a].label}</SelectItem>
                  ))}
                </SelectGroup>
              );
            })}
          </SelectContent>
        </Select>

        {orgNames && (
          <Select
            value={filters.org ?? ALL}
            items={orgItems}
            onValueChange={(v) => apply({ org: v === ALL || !v ? undefined : String(v) })}
          >
            <SelectTrigger className="h-9 w-52" aria-label="Organization">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              <SelectItem value={ALL}>All organizations</SelectItem>
              <SelectSeparator />
              {sortedOrgs.map(([id, name]) => (
                <SelectItem key={id} value={id}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={filters.range ?? ALL}
          items={rangeItems}
          onValueChange={(v) =>
            apply({ range: v === ALL || !v ? undefined : (v as AuditLogFilterState["range"]) })
          }
        >
          <SelectTrigger className="h-9 w-40" aria-label="Date range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(rangeItems).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {activeCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-muted-foreground"
            onClick={() => {
              setSearch("");
              apply({ q: undefined, category: undefined, action: undefined, org: undefined, actor: undefined, range: undefined });
            }}
          >
            <X className="h-4 w-4" />
            Clear filters
          </Button>
        )}
      </div>

      {filters.actor && (
        <div className="flex">
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-secondary py-1 pl-2.5 pr-1 text-xs font-medium">
            <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
            Activity by {actorName ?? "selected user"}
            <button
              type="button"
              onClick={() => apply({ actor: undefined })}
              className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Remove user filter"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

function Count({ n }: { n: number }) {
  return (
    <span className="rounded-full bg-muted-foreground/10 px-1.5 text-[11px] font-medium tabular-nums text-muted-foreground">
      {n.toLocaleString()}
    </span>
  );
}
