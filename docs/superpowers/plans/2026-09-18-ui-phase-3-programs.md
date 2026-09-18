# UI Phase 3: Programs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the Programs surfaces (list, detail, editor, new, generate, upload) onto the Phase 1 foundation: one header pattern, line tabs, a single toolbar row, status badges from the shared mapping, and zero raw palette classes in the touched files.

**Architecture:** Styling and layout only. `ProgramListClient` renders `PageHeader` itself (it owns the tab state) with the Create menu as the single primary action; collections become a chip strip; the four filter controls move into one `PageToolbar` row. `ProgramDetailView` renders `PageHeader` with breadcrumb, one primary action, and an overflow for the rest. Editor, generate, and upload pages drop their hand-rolled back buttons for `PageHeader back`, and their sub-components swap raw palette classes for tokens.

**Tech Stack:** as Phase 2.

**Spec:** `docs/superpowers/specs/2026-09-18-ui-design-system-overhaul-design.md` §3.4, §4.3, §5, §6 phase 3.

## Global Constraints

Identical to the Phase 2 plan's Global Constraints (no git add/commit/stash; no raw palette classes in touched files; one filled primary per screen; tabs = `line` variant via `PageHeader tabs` with the `Tabs` root wrapping header + panels; no gradients; cards `ring-1 ring-border`; status colors only via `StatusBadge`/`ROLE_CLASSES`; behavior preserved; Phase 1 component APIs unchanged). Additional:

- `program-list-client.tsx` is 2,200 lines. Edit surgically; do not split or reorder unrelated code.
- `PageHeader` may be rendered from client components (Phase 2 confirmed). Overflow items with `onSelect` are allowed only from client components (`ProgramDetailView` and `ProgramListClient` are client components).
- Palette total must fall in every task; final Phase 3 target: `program-list-client.tsx`, `program-detail-view.tsx`, `program-editor.tsx`, `program-builder.tsx`, `generate-program-form.tsx`, `program-brief-upload.tsx`, `plan-review-step.tsx`, `create-program-menu.tsx`, `generate-program-entry-dialog.tsx` at 0 raw classes.

---

### Task 1: Programs list — header, tabs, collections chips, one toolbar

**Files:** Modify `components/programs/program-list-client.tsx`, `app/(platform)/programs/page.tsx` (trainer branch only).

- [ ] **Step 1:** In `programs/page.tsx` trainer branch, remove the `<PageHeader>`; `ProgramListClient` now renders it. Keep `<PageShell>`.
- [ ] **Step 2:** In `ProgramListClient`'s return, wrap everything in the existing `<Tabs value={activeTab} onValueChange={handleTabChange}>` and render, as its first child:
  ```tsx
  <PageHeader
    title="Programs"
    description="Build programs in your Library, then assign them to clients."
    primaryAction={
      <CreateProgramMenu onUseTemplate={() => handleTabChange("templates")} trigger={<Button />}>
        <Plus className="size-4" /> Create Program
      </CreateProgramMenu>
    }
    tabs={
      <TabsList variant="line">
        <TabsTrigger value="templates"><Library className="size-4" /> Library</TabsTrigger>
        <TabsTrigger value="programs"><Users className="size-4" /> Assigned</TabsTrigger>
      </TabsList>
    }
  />
  ```
  Delete the old `<TabsList className="grid w-full max-w-xs grid-cols-2">` block and both `CreateProgramMenu` renders inside the Library and Assigned toolbars (the header owns Create now). The outer `<div className="space-y-6">` becomes the Tabs root's children (Tabs root already has `flex flex-col gap-2`; add `className="gap-6"` to the Tabs root).
- [ ] **Step 3: Collections chip strip.** Replace the "Collections" `<h3>` + 6-column tile grid with a single horizontal strip:
  ```tsx
  <div className="flex flex-wrap items-center gap-2">
    <CollectionChip label="All programs" count={…} selected={selectedCollectionId === null} onClick={() => setSelectedCollectionId(null)} />
    {sortedCollections.map((c) => (
      <CollectionChip key={c.id} label={c.name} count={c.programCount} selected={selectedCollectionId === c.id} onClick={() => handleSelectCollection(c.id)} onRename={() => openRenameCollection(c)} onDelete={() => setPendingDeleteCollection(c)} />
    ))}
    <Button variant="ghost" size="sm" onClick={() => setCreateCollectionOpen(true)}><Plus className="size-4" /> New collection</Button>
  </div>
  ```
  Implement `CollectionChip` in the same file by adapting `CollectionTile`: a `rounded-full border px-3 h-8 text-sm` button; selected = `bg-primary text-primary-foreground border-primary`, unselected = `bg-card text-foreground border-border hover:bg-muted`; count in `tabular-nums text-xs opacity-70`; when `onRename`/`onDelete` are given, a `DropdownMenu` on a trailing `MoreHorizontal` icon button (`relative z-10`, `stopPropagation`) with Rename / Delete (destructive). Delete `CollectionTile`, `ViewAllCollectionsCard`, `CreateCollectionCard`, `showAllCollections`, `hasHiddenCollections`, `TOP_COLLECTIONS_LIMIT` logic and the "3 most recent" comment — all collections show as chips. Keep the "selected collection · N programs / Add Programs" row.
- [ ] **Step 4: One toolbar row.** Replace the Library toolbar `<div className="flex flex-col gap-3 sm:flex-row …">` with:
  ```tsx
  <PageToolbar end={(search || activeFilterCount > 0 || chipFilter !== "all") && <Button variant="ghost" size="sm" onClick={…clear…}><X className="size-4" /> Clear</Button>}>
    <div className="relative min-w-48 flex-1 max-w-sm"> …Search Input (h-9, pl-9)… </div>
    <SchedulingPillFilter … />
    <Select …View… />
    <Select …Sort… />
    <Button variant={filtersOpen ? "secondary" : "outline"} size="sm" …>Filters {badge}</Button>
  </PageToolbar>
  ```
  Same for the Assigned toolbar (search + scheduling filter + its own controls; no Create button). All `SelectTrigger`s and the search `Input` get `className="h-9"` so the row is uniform. The Filters count `Badge` → `<StatusBadge status="count" role="brand" dot={false} size="sm" label={String(activeFilterCount)} />`.
- [ ] **Step 5: Badges.** `SchedulingTypeBadge` → `<StatusBadge status={isResource(program) ? "RESOURCE" : "SCHEDULED"} label={isResource(program) ? "Resource" : "Scheduled"} size="sm" />`. The "Template" sub-label → `<StatusBadge status="TEMPLATE" size="sm" dot={false} />` inline after the name. Assigned-tab `ASSIGNED_STATUS_CONFIG` colors → `<StatusBadge status={derived} label={config.label} size="sm" />` (statuses ACTIVE, STARTING_SOON, ON_HOLD, COMPLETED, OTHER→`role="neutral"` are all mapped). Delete the `className`/`dot` color strings from that config.
- [ ] **Step 6:** `ProgramsEmptyState` → `EmptyState` (`icon={Library}`, optional `action` node with the create menu when `showCreateActions`). Tables: wrap each `<Table>` in `<div className="overflow-hidden rounded-xl bg-card ring-1 ring-border">` (do not convert to `DataList`; these rows have bespoke cells and menus). `ResourcesCallout` colors → `bg-info-soft border-info-border text-info-foreground`. Any remaining raw palette class in the file → token.
- [ ] **Step 7: Verify.** tsc; `npx eslint components/programs/program-list-client.tsx "app/(platform)/programs/page.tsx"`; `npm run lint:palette` (file at 0). Hand off.

---

### Task 2: Program detail — header, badges, panels

**Files:** Modify `components/programs/program-detail-view.tsx`, `app/(platform)/programs/[id]/page.tsx`.

- [ ] **Step 1:** `programs/[id]/page.tsx`: wrap in `<PageShell>`; delete the "Back to Programs" ghost button.
- [ ] **Step 2:** In `ProgramDetailView`, replace the hand-rolled header `<div className="flex flex-col gap-4 md:flex-row …">…</div>` with `<PageHeader>` inside a `<Tabs defaultValue="overview" className="gap-6">` root:
  - `breadcrumb={[{ label: isTrainer ? "Programs" : "My Programs", href: "/programs" }, { label: program.name }]}`
  - `title={program.name}`, `description={program.description}`
  - Below the title, PageHeader has no meta slot; render a meta row as the first child after the header: `<div className="-mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><StatusBadge status={program.status} size="sm" />{isTemplate && <StatusBadge status="TEMPLATE" size="sm" dot={false} />}{client && <span>Assigned to …</span>}{startDate && <span>Starts …</span>}</div>`.
  - Trainer, no `clientId`: `primaryAction={<Button onClick={() => setAssignOpen(true)}><UserPlus className="size-4" /> Assign</Button>}`; `secondaryActions={<><Button variant="outline" asChild><Link href={`/programs/${id}/edit`}><Pencil className="size-4" /> Edit</Link></Button>{sharePopover}</>}` where `sharePopover` is the existing Share `Popover` with an outline trigger; `overflow={[{ label: "Duplicate", icon: Copy, onSelect: handleDuplicate }, ...(isTemplate ? [{ label: "Sell this program", icon: Tag, onSelect: () => setSellOpen(true) }] : []), { label: "Download PDF", icon: Download, onSelect: () => void handleDownloadPdf() }, { label: "Print", icon: Printer, onSelect: () => window.open(pdfUrl) }]}`. Extract the inline duplicate handler into `handleDuplicate`. Since Download/Print now live in the overflow, remove the Share popover entirely (its two items are the overflow items) — one fewer control.
  - Trainer with `clientId`: `primaryAction` = Edit (filled); no Assign.
  - `adminMode`: `primaryAction` = Assign (when `!clientId`) else Edit; `secondaryActions` = Edit (when Assign is primary); keep `ProgramActionsMenu` as a secondary node; `description` gains "Owned by {trainerName}" as a meta span.
  - Client role (`!isTrainer && !adminMode`): no actions; the "Start Workout" banner stays below the meta row, restyled `rounded-xl bg-card p-4 ring-1 ring-border`, its button `size="default"`.
  - `tabs={<TabsList variant="line"><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="schedule">Schedule</TabsTrigger></TabsList>}`; `TabsContent` panels follow.
- [ ] **Step 3:** Equipment card → `<SectionCard title="Equipment needed" icon={Dumbbell}>` with the same badge list. Week accordion cards: `Card` → `className="ring-1 ring-border shadow-none"`. Raw palette (5) → tokens (`bg-blue-50/border-blue-200 → bg-info-soft border-info-border`, `text-blue-600 → text-info`, `text-emerald-600 → text-success`, `bg-blue-100 → bg-info-soft`).
- [ ] **Step 4: Verify.** tsc; eslint on both files; palette (detail view at 0). Hand off.

---

### Task 3: Editor pages and the builder

**Files:** Modify `app/(platform)/programs/new/page.tsx`, `app/(platform)/programs/[id]/edit/page.tsx`, `components/programs/program-editor.tsx`, `components/programs/program-builder.tsx`, `components/programs/create-program-menu.tsx`, `components/programs/generate-program-entry-dialog.tsx`.

- [ ] **Step 1:** Both pages: delete the ghost back `Button`; pass `back={{ label: "Back to Programs", href: "/programs" }}` (new) / `back={{ label: "Back to Program", href: `/programs/${id}` }}` (edit) and `breadcrumb={[{ label: "Programs", href: "/programs" }, { label: "Create Program" }]}` / `[{ label: "Programs", href: "/programs" }, { label: program.name, href: `/programs/${id}` }, { label: "Edit" }]` to `PageHeader`.
- [ ] **Step 2:** `program-editor.tsx`: the three `Card` sections ("Program Details", "Categorization", "Equipment Needed") → `SectionCard` with icons (`FileText`, `Tags`, `Dumbbell`); for "Equipment Needed" pass the existing header button as `action`. Field layout inside stays (react-hook-form). Footer buttons: Cancel `variant="outline"`, Save filled (already). Any raw palette → tokens.
- [ ] **Step 3:** `program-builder.tsx`: the 12 raw classes (`bg-blue-50/100`, `border-blue-200/400`, `text-blue-600/950`, `ring-blue-400/500`, `border-gray-300`) → `bg-info-soft`, `border-info-border`, `text-info-foreground`, `ring-ring`, `border-border`. No structural change.
- [ ] **Step 4:** `create-program-menu.tsx`: `text-blue-600 → text-brand`, `text-emerald-600 → text-success`. `generate-program-entry-dialog.tsx`: `bg-blue-500/10 text-blue-600 → bg-brand-soft text-brand-foreground`.
- [ ] **Step 5: Verify.** tsc; eslint on all six; palette (all six at 0). Hand off.

---

### Task 4: Generate and Upload flows

**Files:** Modify `app/(platform)/programs/generate/page.tsx`, `app/(platform)/programs/upload/page.tsx`, `components/programs/generate-program-form.tsx`, `components/programs/program-brief-upload.tsx`, `components/programs/plan-review-step.tsx`, `components/programs/client-details-panel.tsx`.

- [ ] **Step 1:** Both pages: delete ghost back buttons → `PageHeader back={{ label: "Back to Programs", href: "/programs" }}` + breadcrumb `[Programs → Generate Program]` / `[Programs → Upload Program Brief]`. Upload page: remove the inner `<div className="max-w-3xl mx-auto">` (the narrow shell owns width).
- [ ] **Step 2:** `generate-program-form.tsx` (2 raw), `client-details-panel.tsx` (8 raw): tokens only. Cards → `ring-1 ring-border shadow-none`.
- [ ] **Step 3:** `program-brief-upload.tsx` (34 raw) and `plan-review-step.tsx` (21 raw): map every raw class to its role token (`emerald/green → success`, `amber/yellow → warning`, `red/rose → danger`, `blue/sky/indigo → info` or `brand` for AI-specific accents, `violet/purple → brand`, greys → `muted`/`border`/`neutral-*`). Status chips → `StatusBadge`. Step indicators keep their structure.
- [ ] **Step 4: Verify.** tsc; eslint; palette (all at 0). Hand off.

---

### Task 5: Phase 3 verification (controller)

- [ ] tsc, full vitest (3 pre-existing failures only), palette errors 0, `lint:palette` lower than the Phase 2 end total and not stale.
- [ ] Browser 1440px: `/programs` (header + line tabs + chip strip + one toolbar row + Create in header; Library/Assigned switch; filters panel; collection select shows Add Programs row), `/programs/<id>` (breadcrumb, one primary, overflow with Duplicate/Download/Print, line tabs, equipment SectionCard), `/programs/new`, `/programs/<id>/edit` (back link, SectionCards), `/programs/generate` (two-column with a client selected), `/programs/upload`.
