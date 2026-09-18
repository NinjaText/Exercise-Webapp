# UI Phase 2: Trainer Core (Dashboard, Clients list, Client Details) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the three highest-traffic trainer surfaces onto the Phase 1 foundation so they read as one product: flat header instead of a gradient hero, standard `SectionCard` headers, the Clients list as a `DataList`, and a Client Details page with one primary action.

**Architecture:** Phase 1 shipped the primitives (`PageShell`, `PageHeader`, `PageToolbar`, `SectionCard`, `StatusBadge`, `StatCard role`, `DataList`, `EmptyState`, semantic tokens, palette lint). Phase 2 only adopts them: every hand-rolled header, badge, color, and card shell in these three surfaces is replaced by the shared component, and data fetching stays exactly where it is. One prerequisite lands first: `DataList` becomes server-compatible so server pages (Clients, later Audit Log and Admin) can render it.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, shadcn base-nova on @base-ui/react, lucide-react, Vitest 4 (node env, `renderToStaticMarkup`).

**Spec:** `docs/superpowers/specs/2026-09-18-ui-design-system-overhaul-design.md` §3.4 (elevation, no page gradients), §4.3 (template rules), §4.4 (Client Details showcase), §5 (component standards), §6 phase 2.

## Global Constraints

- **Never run `git add`, `git commit`, `git stash`, or `git mv`.** The user reviews and commits. Where a step would commit, "Hand off for review".
- **No raw Tailwind palette classes** in `app/**` or `components/**` (rule `design/no-raw-palette`). Files touched here must end with FEWER raw classes than their baseline; use `ROLE_CLASSES` / semantic tokens (`bg-danger`, `text-warning-foreground`, `bg-success-soft`, …).
- **One filled primary button per screen** (spec §4.3). Everything else is `outline`, `ghost` (icon/row actions only), or in the `PageHeader` overflow.
- **Tabs are always the `line` variant** of `components/ui/tabs.tsx`, rendered through `PageHeader`'s `tabs` slot. Pattern for server pages: the `<Tabs>` root wraps BOTH the `PageHeader` and the `TabsContent` panels; `PageHeader` receives only the `<TabsList variant="line">…</TabsList>` node.
- **No page-level gradients** (spec §3.4): `bg-gradient-*`, `bg-linear-to-*`, and inline `linear-gradient(...)` are removed from these surfaces (the sidebar keeps its gradient).
- **Cards:** every panel is a `SectionCard` (header: icon + title + optional count + one action) or a plain `Card` with `ring-1 ring-border`; no `shadow-md`, no `hover:-translate-y-*`.
- **Status colors** only via `StatusBadge` or `ROLE_CLASSES[statusRole(x)]`. Priority severities map `high → danger`, `medium → warning`, `low → success` (already in `lib/ui/status.ts`).
- **Behavior is preserved**: every link, dialog, filter, deep link (`?focus=`, `?tab=`), and server action that works today still works. Redesign is layout and styling only.
- Component APIs from Phase 1 (do not change unless a task says so): `PageShell({width})`, `PageHeader({title, description, breadcrumb, back, primaryAction, secondaryActions, overflow: {label, href, icon?, destructive?}[], tabs})`, `PageToolbar({children, end})`, `SectionCard({title, icon, count, description, action, href, children})`, `StatusBadge({status, label?, role?, dot?, size?})`, `StatCard({label, value, icon, description?, trend?, href?, role?, size?})`, `DataList<T>({columns, data, keyExtractor, rowHref?, onRowClick?, density?, stickyHeader?, maxHeight?, emptyState?, emptyMessage?})`, `EmptyState({icon, title, description?, size?, action?})`.
- Verification per task: `npx tsc --noEmit`, `npx vitest run <touched test dirs>`, `npx eslint <touched files>`, `npm run lint:palette` (total must fall vs. the previous task). Controller does the 1440px browser check.
- Existing 3 failing tests in `actions/__tests__/admin-actions.test.ts` are pre-existing and out of scope.

---

## File map

| Path | Responsibility |
|---|---|
| `components/shared/data-list.tsx` (modify) | Drop `"use client"`; delegate clickable rows to `ClickableRow` |
| `components/shared/clickable-row.tsx` (create) | Client `TableRow` with click + Enter/Space activation |
| `components/shared/__tests__/data-list.test.tsx` (modify) | Keep passing; add server-render test |
| `components/shared/stat-card.tsx` (modify) | Add `onClick` (renders a `<button>` wrapper) |
| `components/dashboard/trainer-dashboard-client.tsx` (modify) | Flat header + stat strip; grid unchanged |
| `components/dashboard/todays-priorities-card.tsx` (modify) | `SectionCard` shell; severity colors via roles |
| `components/dashboard/week-workouts-card.tsx` (modify) | `SectionCard` shell; filters row inside body |
| `components/dashboard/week-workout-client-row.tsx` (modify) | Day-dot colors via roles |
| `components/dashboard/dashboard-inbox-card.tsx` (modify) | `SectionCard` shell with `count`; token colors |
| `components/dashboard/client-progress-overview-card.tsx` (modify) | `SectionCard` shell; arc colors via CSS vars |
| `components/dashboard/pending-feedback-sheet.tsx` (modify, colors only) | Token colors |
| `app/(platform)/clients/page.tsx` (modify) | `DataList` + `PageToolbar` + line tabs |
| `components/clients/client-archived-toggle.tsx` (modify) | Renders an outline `Button size="sm"` |
| `components/clients/client-actions-menu.tsx` (modify) | `relative z-10` wrapper; token color for destructive-ish item |
| `app/(platform)/clients/[id]/page.tsx` (modify) | `PageShell` + `PageHeader` (breadcrumb, primary/secondary/overflow, line tabs) + stat strip + `SectionCard` |
| `components/clients/client-adherence-summary.tsx` (modify) | Becomes a 4-up compact `StatCard` strip |
| `components/clients/clinical-profile-card.tsx` (modify, shell only) | Wrapped in `SectionCard` with the Edit action |
| `components/calendar/client-calendar.tsx` (modify, toolbar only) | Remove duplicate Generate/Assign buttons; Create Workout becomes `outline` |

---

### Task 1: Server-compatible DataList with `ClickableRow`

**Files:**
- Create: `components/shared/clickable-row.tsx`
- Modify: `components/shared/data-list.tsx`
- Test: `components/shared/__tests__/data-list.test.tsx`

**Interfaces:**
- Produces: `ClickableRow({ onActivate: () => void; className?; children; "data-clickable"?: string })` — a `"use client"` `TableRow` with `onClick`, `tabIndex={0}`, Enter/Space → `onActivate`, and the focus ring classes. `DataList` no longer has `"use client"`; its public props are unchanged. When `onRowClick` is set and there is no `href`, the row is `<ClickableRow onActivate={() => onRowClick(item)}>`; otherwise a plain `TableRow`.

- [ ] **Step 1: Add a test that DataList renders without a client boundary**

Append to `components/shared/__tests__/data-list.test.tsx`:

```tsx
it("renders rowHref rows without ClickableRow and onRowClick rows with it", () => {
  const hrefHtml = renderToStaticMarkup(
    <DataList columns={columns} data={rows} keyExtractor={(r) => r.id} rowHref={(r) => `/c/${r.id}`} />
  );
  expect(hrefHtml).not.toContain('tabindex="0"');
  const clickHtml = renderToStaticMarkup(
    <DataList columns={columns} data={rows} keyExtractor={(r) => r.id} onRowClick={() => {}} />
  );
  expect(clickHtml).toContain('tabindex="0"');
  expect(clickHtml).toContain('data-clickable="true"');
});
```

Run `npx vitest run components/shared/__tests__/data-list.test.tsx`; it should pass already (behavior exists) — this test pins the behavior across the refactor.

- [ ] **Step 2: Create `components/shared/clickable-row.tsx`**

```tsx
"use client";

import * as React from "react";
import { TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface ClickableRowProps extends Omit<React.ComponentProps<typeof TableRow>, "onClick"> {
  onActivate: () => void;
}

/**
 * A table row that is a real control: click, Enter or Space activate it and
 * it shows a focus ring. DataList renders this only for `onRowClick` rows, so
 * server pages that use `rowHref` never pull in a client boundary.
 */
export function ClickableRow({ onActivate, className, children, ...props }: ClickableRowProps) {
  return (
    <TableRow
      {...props}
      data-clickable="true"
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onActivate();
        }
      }}
      className={cn(
        "relative cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        className
      )}
    >
      {children}
    </TableRow>
  );
}
```

- [ ] **Step 3: Refactor `components/shared/data-list.tsx`**

Remove the `"use client"` directive. Import `ClickableRow`. In the row map, replace the single `TableRow` with:

```tsx
const href = rowHref?.(item);
const cells = columns.map((col, i) => ( /* unchanged cell rendering incl. first-cell Link when href */ ));
if (!href && onRowClick) {
  return (
    <ClickableRow key={keyExtractor(item)} onActivate={() => onRowClick(item)}>
      {cells}
    </ClickableRow>
  );
}
return (
  <TableRow key={keyExtractor(item)} data-clickable={href ? "true" : undefined} className={cn("relative", href && "cursor-pointer")}>
    {cells}
  </TableRow>
);
```

Delete the now-unused `tabIndex`/`onKeyDown`/focus classes from `data-list.tsx` (they live in `ClickableRow`). Update the JSDoc: "Server-compatible. `rowHref` rows are plain anchors; `onRowClick` rows render the client `ClickableRow`, so `onRowClick` is only usable from client components."

- [ ] **Step 4: Verify**

`npx vitest run components/shared`, `npx tsc --noEmit`, `npx eslint components/shared/data-list.tsx components/shared/clickable-row.tsx`. All green; `grep -n '"use client"' components/shared/data-list.tsx` prints nothing.

- [ ] **Step 5: Hand off for review**

---

### Task 2: StatCard `onClick`

**Files:**
- Modify: `components/shared/stat-card.tsx`
- Test: `components/shared/__tests__/stat-card.test.tsx` (create)

**Interfaces:**
- Produces: `StatCardProps.onClick?: () => void`. When `onClick` is set (and no `href`), the card is wrapped in `<button type="button" className="block w-full text-left rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">` and gets the same hover treatment as `href`. `href` wins if both are set.

- [ ] **Step 1: Test**

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Users } from "lucide-react";
import { StatCard } from "../stat-card";

describe("StatCard", () => {
  it("renders a link when href is set", () => {
    const html = renderToStaticMarkup(<StatCard label="Clients" value={3} icon={Users} href="/clients" />);
    expect(html).toContain('href="/clients"');
    expect(html).toContain("hover:ring-border-strong");
  });
  it("renders a button when onClick is set", () => {
    const html = renderToStaticMarkup(<StatCard label="Pending" value={2} icon={Users} onClick={() => {}} />);
    expect(html).toContain('<button type="button"');
    expect(html).toContain("hover:ring-border-strong");
  });
  it("uses role colors for the icon badge", () => {
    const html = renderToStaticMarkup(<StatCard label="x" value={1} icon={Users} role="warning" size="compact" />);
    expect(html).toContain("bg-warning-soft");
    expect(html).toContain("text-warning-foreground");
  });
});
```

Run: FAIL on the button assertion.

- [ ] **Step 2: Implement** — add `onClick?: () => void` to props; compute `const interactive = Boolean(href || onClick)`; use `interactive` where `href` currently gates the hover classes; at the bottom:

```tsx
if (href) return <Link href={href} className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">{card}</Link>;
if (onClick) return <button type="button" onClick={onClick} className="block w-full rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">{card}</button>;
return card;
```

Note: `stat-card.tsx` has no `"use client"`; a server page cannot pass `onClick`, which is fine (only client callers do). Add a JSDoc line.

- [ ] **Step 3: Verify** `npx vitest run components/shared/__tests__/stat-card.test.tsx`, tsc, eslint. Hand off.

---

### Task 3: Trainer dashboard — flat header and stat strip

**Files:**
- Modify: `components/dashboard/trainer-dashboard-client.tsx`
- Modify: `app/(platform)/dashboard/page.tsx` (wrap the trainer branch's return in `<PageShell>`; leave the client branch alone — Phase 5)

**Interfaces:**
- Consumes: `PageShell`, `PageHeader` (client-safe: it is a server component but renders fine from a client component since it has no server-only APIs — if tsc/Next complains about importing it from a client file, render `PageHeader` in `trainer-dashboard.tsx` (server) and pass the stat strip + cards as children instead; report which), `StatCard` with `onClick`/`href`/`role`, `GenerateProgramEntryDialog`, `AddClientDialog`.

- [ ] **Step 1: Replace the gradient hero**

In `trainer-dashboard-client.tsx`, delete the `<Card style={{ background: "linear-gradient(...)" }}>…</Card>` hero block and the `heroStats` array rendering. Replace with:

```tsx
<PageHeader
  title={`${greeting} 👋`}
  description="Here's what's happening with your clients today."
  primaryAction={
    <GenerateProgramEntryDialog trigger={<Button />}>
      <Sparkles className="size-4" />
      Generate Program
    </GenerateProgramEntryDialog>
  }
  secondaryActions={<AddClientDialog triggerVariant="outline" />}
/>

<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
  <StatCard size="compact" label="Clients needing attention" value={clientsNeedingAttention} icon={AlertTriangle} role={clientsNeedingAttention > 0 ? "warning" : "success"} href="/dashboard?focus=priorities" />
  <StatCard size="compact" label="Sessions due today" value={sessionsDueToday} icon={CalendarDays} role="info" href="/dashboard?focus=sessions-today" />
  <StatCard size="compact" label="Pending feedback" value={pendingFeedback} icon={MessageSquareText} role="brand" onClick={() => setFeedbackSheetOpen(true)} />
  <StatCard size="compact" label="Unread messages" value={unreadMessages} icon={Inbox} role={unreadMessages > 0 ? "info" : "neutral"} href={unreadMessages > 0 ? "/messages?filter=unread" : "/messages"} />
</div>
```

`StatCard` `href` uses `next/link` with default scroll; the old hero used `scroll={false}` for the two `?focus=` tiles. Preserve that: add an optional `scroll?: boolean` prop to `StatCard` that is forwarded to `Link` (default `true`), and pass `scroll={false}` on those two tiles. Update the Task 2 test file with one assertion that `scroll={false}` still renders the `href`.

`AddClientDialog` currently takes `triggerClassName`; check its props. If it has no variant prop, add `triggerVariant?: ButtonProps["variant"]` (default `"default"`) and pass it to its trigger `Button`; keep `triggerClassName` working. Do not restyle the dialog body.

Remove the now-unused imports (`Card`, `CardContent`, `Link` if unused) and the `statValueClassName`/`statLabelClassName` constants. The outer `<div className="space-y-5">` becomes a fragment (PageShell supplies `gap-6`).

- [ ] **Step 2: Wrap in PageShell**

In `app/(platform)/dashboard/page.tsx`, the trainer branch returns `<TrainerDashboard …/>`; change to `<PageShell><TrainerDashboard …/></PageShell>` with the import. Leave the client-dashboard return untouched.

- [ ] **Step 3: Verify** tsc, eslint on both files, `npm run lint:palette` (trainer-dashboard-client.tsx must have 0 raw classes now). Hand off.

---

### Task 4: Dashboard cards on SectionCard and role colors

**Files:**
- Modify: `components/dashboard/todays-priorities-card.tsx`, `components/dashboard/week-workouts-card.tsx`, `components/dashboard/week-workout-client-row.tsx`, `components/dashboard/dashboard-inbox-card.tsx`, `components/dashboard/client-progress-overview-card.tsx`, `components/dashboard/pending-feedback-sheet.tsx`

**Interfaces:**
- Consumes: `SectionCard`, `StatusBadge`, `ROLE_CLASSES`, `statusRole` from `lib/ui/status.ts`.

Rules for every card in this task: outer `Card`/`CardHeader`/`CardTitle` → `SectionCard` with `icon`, `title`, optional `count`, and the existing right-side link as `action={{ label, href }}`. Body markup stays; only colors change. Card `className="h-full"` where the grid relied on it (`todays-priorities-card`, `week-workouts-card`).

- [ ] **Step 1: `todays-priorities-card.tsx`** — `SectionCard title="Today's Priorities" icon={ListChecks} count={priorities.length} className="h-full"`. Replace `severityDot` with `ROLE_CLASSES[statusRole(severity)].dot` (`high→danger`, `medium→warning`, `low→success` already map). Replace `severityBadge` usage with `<StatusBadge status={severity} label={severityLabel[severity]} size="sm" />`. Remove the two deleted records.

- [ ] **Step 2: `week-workouts-card.tsx`** — `SectionCard title={dateScope === "today" ? "Today's Workouts" : "This Week's Workouts"} icon={CalendarDays} action={{ label: "View all", href: "/programs" }} className="h-full"`. The status filter `Tabs` and client `Select` row moves into the body as the first child (keep as is; ensure `TabsList` uses `variant="line"` — if it looked like pills before, switch to line). Everything else unchanged.

- [ ] **Step 3: `week-workout-client-row.tsx`** — `dayDotStyles`: `completed → cn(ROLE_CLASSES.success.dot, "border-success")`, `missed → cn(ROLE_CLASSES.warning.dot, "border-warning")`, `scheduled → "bg-transparent border-info"`, `none → "bg-transparent border-border"`. No raw palette.

- [ ] **Step 4: `dashboard-inbox-card.tsx`** — `SectionCard title="Inbox" icon={Inbox} count={unreadCount > 0 ? unreadCount : undefined} action={{ label: "View all", href: "/messages" }}`. Category pill buttons: active `bg-primary text-primary-foreground` stays; inactive `bg-muted text-muted-foreground`. Empty state → `<EmptyState size="compact" icon={Inbox} title="No messages yet" />`. Unread `Badge` → `<StatusBadge status="unread" role="brand" dot={false} size="sm" label={String(thread.unreadCount)} />`.

- [ ] **Step 5: `client-progress-overview-card.tsx`** — `SectionCard title="Client Progress Overview" icon={TrendingUp} action={{ label: "View report", href: "/clients" }}`. `SEGMENTS` colors: `onTrack: "var(--success)"`, `atRisk: "var(--warning)"`, `offTrack: "var(--danger)"`; dots via `ROLE_CLASSES.success.dot` etc. Empty → `<EmptyState size="compact" icon={Users} title="No active clients yet" />`.

- [ ] **Step 6: `pending-feedback-sheet.tsx`** — colors only: any raw palette class → the semantic equivalent (`text-emerald-* → text-success`, `text-amber-* → text-warning-foreground`, `bg-*-50 → bg-*-soft`). No structural change.

- [ ] **Step 7: Verify** `npx vitest run components/dashboard`, tsc, eslint on the six files, `npm run lint:palette`: each of the six files should now have 0 raw classes. Hand off.

---

### Task 5: Clients list as DataList

**Files:**
- Modify: `app/(platform)/clients/page.tsx`
- Modify: `components/clients/client-archived-toggle.tsx`
- Modify: `components/clients/client-actions-menu.tsx`

**Interfaces:**
- Consumes: `DataList` (server-compatible from Task 1), `PageToolbar`, `StatusBadge`, `EmptyState`, `Tabs` line variant through `PageHeader tabs`.

- [ ] **Step 1: Restructure the page**

Target structure (keep all data code above the return unchanged):

```tsx
<PageShell>
  <Tabs defaultValue="clients">
    <PageHeader
      title="Clients"
      description={`${scopedClients.length} ${showArchived ? "inactive" : "active"} client${scopedClients.length !== 1 ? "s" : ""} in your organization`}
      primaryAction={<AddClientDialog />}
      tabs={
        <TabsList variant="line">
          <TabsTrigger value="clients">Clients</TabsTrigger>
          <TabsTrigger value="invitations">Invitations{pendingCount > 0 ? ` (${pendingCount})` : ""}</TabsTrigger>
        </TabsList>
      }
    />
    <TabsContent value="clients" className="flex flex-col gap-4">
      <PageToolbar end={<Suspense fallback={null}><ClientArchivedToggle /></Suspense>}>
        <Suspense fallback={<Skeleton className="h-9 w-full max-w-sm" />}><ClientSearch /></Suspense>
      </PageToolbar>
      <DataList
        columns={clientColumns}
        data={clients}
        keyExtractor={(c) => c.id}
        rowHref={(c) => `/clients/${c.id}`}
        emptyState={<EmptyState size="compact" icon={Users} title={…same three titles…} description={…same three descriptions…} />}
      />
    </TabsContent>
    <TabsContent value="invitations"><InvitationsTable invitations={invitations} /></TabsContent>
  </Tabs>
</PageShell>
```

`clientColumns` (define above the component, typed on the element type of `getClientsForTrainer`'s result):

```tsx
const clientColumns: Column<ClientRow>[] = [
  {
    key: "name",
    header: "Client",
    render: (c) => (
      <div className="flex items-center gap-3">
        <Avatar className="size-8">
          <AvatarImage src={c.imageUrl || undefined} />
          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{getInitials(c)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className={cn("truncate text-sm font-medium", c.isActive === false && "text-muted-foreground")}>{getDisplayName(c)}</p>
          {getDisplayName(c) !== c.email && <p className="truncate text-xs text-muted-foreground">{c.email}</p>}
        </div>
      </div>
    ),
  },
  { key: "status", header: "Status", render: (c) => <StatusBadge status={c.isActive === false ? "INACTIVE" : "ACTIVE"} size="sm" /> },
  { key: "joined", header: "Joined", align: "right", render: (c) => format(c.createdAt, "MMM d, yyyy") },
  { key: "actions", header: "", className: "w-12", render: (c) => <div className="relative z-10 flex justify-end"><ClientActionsMenu clientId={c.id} isActive={c.isActive !== false} /></div> },
];
```

Delete `avatarGradients`/`getAvatarGradient` and the card grid. Remove unused imports (`Card`, `Badge`, `ChevronRight`, `Mail`, `Link`).

- [ ] **Step 2: `client-archived-toggle.tsx`** — render `<Button variant="outline" size="sm" onClick={toggle}>{archived ? "Hide inactive" : "Show inactive"}</Button>` instead of the bare text button.

- [ ] **Step 3: `client-actions-menu.tsx`** — trigger becomes `<DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Client actions" />} …>`; the "Mark inactive" item drops `text-amber-600` in favor of `variant="destructive"`? No — inactive is reversible, not destructive; use plain default styling. Keep the `stopPropagation` handlers (they prevent the row link from firing).

- [ ] **Step 4: Verify** tsc, eslint on the three files, `npm run lint:palette` (clients/page.tsx → 0 raw). Hand off.

---

### Task 6: Client Details showcase (spec §4.4)

**Files:**
- Modify: `app/(platform)/clients/[id]/page.tsx`
- Modify: `components/clients/client-adherence-summary.tsx`
- Modify: `components/clients/clinical-profile-card.tsx` (outer shell only)
- Modify: `components/calendar/client-calendar.tsx` (toolbar only)
- Modify: `components/clients/assign-program-button.tsx` (variant/size only)

**Interfaces:**
- Consumes: `PageShell`, `PageHeader` (breadcrumb, primaryAction, secondaryActions, overflow, tabs), `StatCard`, `SectionCard`, `Tabs` line.

- [ ] **Step 1: Header**

Replace the back-button row and the identity `Card` with:

```tsx
<PageShell>
  <Tabs defaultValue={initialTab}>
    <PageHeader
      breadcrumb={[{ label: "Clients", href: "/clients" }, { label: displayName }]}
      title={displayName}
      description={[showEmail ? client.email : null, client.dateOfBirth ? `Born ${client.dateOfBirth}` : null].filter(Boolean).join(" · ") || undefined}
      primaryAction={<AssignProgramButton client={…} />}
      secondaryActions={
        <Button variant="outline" asChild>
          <Link href={`/messages/${client.id}`}><MessageSquare className="size-4" />Message</Link>
        </Button>
      }
      overflow={[
        { label: "Create program", href: `/programs/new?clientId=${id}`, icon: Pencil },
        { label: "Generate with AI", href: `/programs/generate?clientId=${id}`, icon: Sparkles },
        { label: "Upload a program", href: `/programs/upload?clientId=${id}`, icon: Upload },
        { label: "Sessions", href: `/clients/${id}/adherence`, icon: Activity },
        { label: "Outcomes", href: `/clients/${id}/outcomes`, icon: BarChart3 },
        { label: "Progress", href: `/clients/${id}/progress`, icon: TrendingUp },
      ]}
      tabs={
        <TabsList variant="line">
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="programs">Programs ({assignedPrograms.length})</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
        </TabsList>
      }
    />
    {/* stat strip, clinical profile, tab panels below */}
  </Tabs>
</PageShell>
```

Remove `CreateProgramMenu` and `ClientProgressTrigger` from this page (their functionality is now reachable via the overflow links; the Progress page `/clients/[id]/progress` already exists). Remove the avatar from the header (the name is the title). Delete unused imports.

Make `AssignProgramButton` render `variant="default"` (filled) at default size, label "Assign program".

- [ ] **Step 2: Stat strip**

`client-adherence-summary.tsx` returns a grid of four compact StatCards instead of the strip:

```tsx
if (total === 0) return null;
return (
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <StatCard size="compact" label="Completion" value={`${completionRate}%`} icon={Target} role={completionRate >= 70 ? "success" : completionRate >= 40 ? "warning" : "danger"} href={`/clients/${clientId}/adherence`} />
    <StatCard size="compact" label="Completed" value={completed} icon={CheckCircle2} role="success" />
    <StatCard size="compact" label="Missed" value={missedOrSkipped} icon={XCircle} role={missedOrSkipped > 0 ? "warning" : "neutral"} />
    <StatCard size="compact" label="Avg RPE" value={avgRPE != null ? `${avgRPE}/10` : "—"} icon={Gauge} />
  </div>
);
```

Render it directly under `PageHeader` in the page (no wrapping Card).

- [ ] **Step 3: Clinical profile** — in `clinical-profile-card.tsx`, replace the outer `Card`/header with `<SectionCard title="Clinical profile" icon={Stethoscope} action={action}>` where `action` is the existing `ClientProfileEditButton` node (make that button `variant="outline" size="sm"`). Body unchanged.

- [ ] **Step 4: Tab panels** — `Programs` panel: `<SectionCard title="Assigned programs" icon={Library} count={assignedPrograms.length}><AssignedProgramsList …/></SectionCard>`. `Messages` panel: keep the `Card` but use `className="overflow-hidden p-0 ring-1 ring-border shadow-none"`. Calendar panel unchanged apart from Step 5.

- [ ] **Step 5: Calendar toolbar** — in `client-calendar.tsx`: delete the "Generate with AI" `Button` (and the `onAiGenerateClick` prop/wiring only if it becomes unused — check callers; if it is still used elsewhere, keep the prop but stop rendering the button here). Change "Create Workout" to `variant="outline" size="sm"`. Delete the `AssignProgramDialog` + "Assign Program" button block in the legend row (the header owns Assign). Remove unused imports (`Sparkles`, `Dumbbell`, `AssignProgramDialog` if unused).

- [ ] **Step 6: Verify** tsc, eslint on the five files, `npm run lint:palette`. Hand off.

---

### Task 7: Phase 2 verification (controller)

- [ ] `npx tsc --noEmit`; `npm run test` (only the 3 pre-existing failures); `npm run lint 2>&1 | grep -c design/no-raw-palette` = 0; `npm run lint:palette` total lower than 953 and no stale entries (run `--write` if stale).
- [ ] Browser at 1440px: `/dashboard` (flat header, 4 stat cards, 5 SectionCards, `?focus=priorities` still expands, Pending feedback opens the sheet), `/clients` (list rows navigate, search/archived toggle work, tabs line style, actions menu opens without navigating), `/clients/<id>` (breadcrumb "Clients / Name", one filled button, overflow menu, tabs line, stat strip, calendar toolbar without duplicates, `?tab=programs` deep link).
- [ ] Hand off with palette totals and screenshots.

## Self-review
- §4.4 → Task 6. §5 SectionCard/DataList/StatCard adoption → Tasks 3–6. §3.4 gradients removed → Task 3 (hero), Task 5 (avatar gradients). One primary per screen → Tasks 3, 5, 6. Line tabs → Tasks 5, 6, and Task 4 step 2. DataList server prerequisite → Task 1. Deep links preserved: `?focus=` (Task 3 keeps hrefs and `scroll={false}`), `?tab=` (Task 6 keeps `defaultValue={initialTab}`).
