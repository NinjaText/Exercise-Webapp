# Trainer Phone Pass Implementation Plan (Plan 1b of 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every trainer route usable at 390 px (iPhone 15 class) inside the app and in mobile browsers: nothing overflows or hides behind hover, touch targets reach 44 px on touch devices, Tier 1 screens get phone-first layouts, and Tier 3 tools show a read-only view plus a desktop-only notice.

**Architecture:** Fix shared primitives once (Button/Tabs touch and overflow behaviour, hover-only reveals, a `useIsPhone()` hook and a `DesktopOnlyNotice`), then apply per-route changes from the 390 px audit. Page-level phone/desktop switches use CSS breakpoints (`sm:hidden` / `hidden sm:block`) so server-rendered HTML is right on first paint; `useIsPhone()` is used only for behaviour (for example turning drag off). Touch sizing uses Tailwind 4's `pointer-coarse:` variant so desktop density is unchanged.

**Tech Stack:** Next.js 16 App Router, Tailwind CSS 4.2 (`pointer-coarse:`/`pointer-fine:` variants), shadcn-style primitives on `@base-ui/react`, Vitest 4 (node env, `renderToStaticMarkup`, no jsdom).

**Spec:** `docs/superpowers/specs/2026-09-20-mobile-app-capacitor-design.md` §5a. Roadmap: `docs/superpowers/plans/2026-09-21-mobile-app-roadmap.md`.

## Audit result (the spec's "audit first" step, done 2026-09-27 as a static code audit)

No signed-in browser was available, so every trainer route and its components were read against 390 px (only unprefixed Tailwind classes apply; usable width 358 px after the 16 px gutter). Result: **19 works / 14 cramped / 5 broken** (plus `/calendar`, which redirects trainers, and `/messages/[threadId]`, which redirects trainers into `/messages`).

| Route | State | Tier | Main problem |
|---|---|---|---|
| dashboard | works | 1 | shared touch targets |
| clients | cramped | 1 | desktop table, must swipe for status/actions |
| clients/[id] | cramped | 1 | 4 header controls wrap to 3 rows; calendar event menu 20 px; drag on phone |
| clients/[id]/adherence | works | 1 | — |
| clients/[id]/outcomes | works | 2 | — |
| clients/[id]/progress | **broken** | 2 | 3 long nowrap tab labels overflow the page; header doesn't wrap |
| clients/[id]/sessions/[sessionId] | cramped | 1 | 5-column set table |
| sessions/[id] | works | 1 | — |
| messages (+ thread) | works | 1 | own-message edit/delete hover-only; composer icons 32 px |
| check-ins, check-ins/[id] | works | 1/2 | — |
| check-ins/new | cramped | 2 | reorder/delete buttons 20–24 px in an unwrapped row |
| habits | cramped | 2 | delete hover-only |
| assessments, assessments/new | works | 2 | — |
| notifications (header popover) | cramped | 1 | 36 px bell, anchored popover |
| programs | cramped | 2 | row actions hover-only |
| programs/[id] | cramped | 2 | Schedule tab is a drag-only calendar (Tier 3 feature) |
| programs/[id]/edit, programs/new | **broken** | 3 | builder headers have fixed widths; 3-button footer overflows |
| programs/generate | **broken** | 3 | circuit row overflows |
| programs/upload | cramped | 3 | authoring tool |
| exercises | **broken** | 2 | bulk-select pill wider than viewport; card actions hover-only |
| exercises/[id], exercises/new | works | 2 | — |
| exercises/[id]/edit | cramped | 2 | media delete buttons tiny |
| exercises/bulk-import | **broken** (row) | 3 | `truncate` without `min-w-0` |
| nutrition, analytics | works | 2 | — |
| nutrition/[clientId] | cramped | 2 | meal action icons tiny |
| settings, settings/notifications | works | 2 | — |
| settings/billing, settings/clinic | works | 3 in nav-items | single-column, nothing to protect |
| settings/audit-log | cramped | 3 in nav-items | table needs swipe, small pagination |

Shared findings: no Button size reaches 44 px; global search has no phone entry point; `TabsList` has no overflow handling; `opacity-0 group-hover:opacity-100` hides real actions in 5 components; no `useIsPhone()` or `DesktopOnlyNotice` exists.

## Rulings made while writing this plan

1. **Touch sizing via `pointer-coarse:`.** Every Button size gets an effective hit area of at least 44 px on coarse pointers (phones, tablets): `default`/`lg`/`icon`/`icon-lg` grow visually (`pointer-coarse:h-11` / `pointer-coarse:size-11`); `xs`/`sm`/`icon-xs`/`icon-sm` keep their look in dense rows and gain an invisible hit-slop pseudo-element. Desktop (fine pointer) is pixel-identical.
2. **Hover-only reveals become `pointer-fine:`-gated** (`pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100` + `focus-visible:opacity-100`), so touch devices always see the control.
3. **Settings billing/clinic/audit-log move from Tier 3 to Tier 2** in `nav-items.ts`. The audit found them single-column and unbroken; there is no editor to protect, and on native, billing already shows the attention screen. The audit log drops its Details column below `sm` instead of getting a notice. Cost if wrong: a later one-line tier change.
4. **Check-ins, habits and assessments stay out of the navigation.** They have no entry point on any screen size today, which may be deliberate (unfinished features). They get layout fixes only; adding them to the nav is the owner's call.
5. **Tier 3 gating is CSS-first.** `DesktopOnlyNotice` renders `sm:hidden`; the desktop tool is wrapped in `hidden sm:block`. `useIsPhone()` (below 640 px) is only for behaviour such as disabling drag. This avoids a flash of the desktop builder on phones and needs no client-side check to render.

## Global Constraints

- 390 px is the design width; the phone breakpoint is below `sm` (640 px). `useIsPhone()` = `(max-width: 639.98px)` media query, `false` on the server.
- Touch-target floor: 44 px effective hit area on `pointer-coarse`. Desktop density (fine pointer, ≥ `lg`) must not change.
- No horizontal page overflow at 390 px on any trainer route. Dense tables may scroll inside their own `overflow-x-auto` wrapper.
- `DesktopOnlyNotice` copy is exactly: title "This tool is built for a larger screen", body "Open Inmotus RX on a laptop to edit." (spec §5a).
- Colours only via semantic tokens (`design/no-raw-palette` is an error). Match surrounding code style.
- Client (role `CLIENT`) experience must not change except through shared primitives.
- Tests: Vitest node env with `renderToStaticMarkup`; assert class presence/structure for layout rules, and behaviour for pure helpers. Lint each changed file, quoted.
- Each task ends with one commit of exactly its files, Conventional Commit subject, trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. If the permission system denies `git add`/`git commit`, don't retry: leave the changes and list the files; the controller commits after review. Nothing is pushed.

## Review Focus

1. **Desktop regressions from primitive changes.** A Button or Tabs change that alters laptop layouts is the most likely breakage. → Task 1 tests assert that pointer-fine classes are unchanged and that every coarse-pointer addition is behind `pointer-coarse:`.
2. **A Tier 3 page that shows nothing, or both views, on some width.** → Task 4 tests render each gated page's wrapper and assert exactly one `sm:hidden` notice block and one `hidden sm:block` tool block.
3. **Hover-only actions still unreachable.** → Task 1 includes a repo-wide check that no `opacity-0 group-hover:opacity-100` remains without a `pointer-fine:` prefix on a functional control.
4. **Tabs overflowing the page.** → Task 1 tests the `TabsList` overflow classes; Task 3 fixes and tests the progress page.
5. **Drag as the only way to act on a phone.** → Task 3 (client calendar) and Task 4 (program schedule) turn drag off on phones and keep a tap path (the existing event menu / edit dialog), with tests on the pure `draggable` decision.

---

### Task 1: Shared primitives — phone hook, desktop-only notice, touch targets, tabs, hover reveals

**Files:**
- Create: `hooks/use-is-phone.ts`, `hooks/__tests__/use-is-phone.test.ts`, `components/shared/desktop-only-notice.tsx`, `components/shared/__tests__/desktop-only-notice.test.tsx`, `components/ui/__tests__/button-touch.test.tsx`, `components/ui/__tests__/tabs-overflow.test.tsx`
- Modify: `components/ui/button.tsx`, `components/ui/tabs.tsx`, `components/shared/page-header.tsx` (tabs slot), `components/layout/mobile-tab-bar.tsx` + `components/layout/nav-items.ts` (tier labels, ruling 3), and the hover-reveal files: `components/messages/message-thread.tsx` (~:596), `components/habits/habit-card.tsx` (~:130), `components/exercises/exercise-card.tsx` (~:194–216), `components/programs/program-list-client.tsx` (~:512, :519, :738), `components/programs/program-builder.tsx` (~:1067)

**Interfaces:**
- Produces:
  ```ts
  export const PHONE_QUERY = "(max-width: 639.98px)";
  export function useIsPhone(): boolean; // false on the server and first client render; then tracks the query
  export function DesktopOnlyNotice(props: { className?: string }): JSX.Element; // renders with sm:hidden
  ```

- [ ] **Step 1: `useIsPhone`.** Implement with `useSyncExternalStore` (subscribe to `matchMedia(PHONE_QUERY)` change events; `getServerSnapshot` → `false`; guard `typeof window`). Tests: server snapshot false; with a stubbed `window.matchMedia` returning `matches: true`, the snapshot getter returns true; subscribe adds and removes a `change` listener. Export the subscribe/getSnapshot functions for testing if needed.

- [ ] **Step 2: `DesktopOnlyNotice`.** A `Card` (existing `components/ui/card`) with a `Monitor` lucide icon, title "This tool is built for a larger screen", body "Open Inmotus RX on a laptop to edit.", root classes include `sm:hidden`, semantic tokens only (`bg-muted`, `text-muted-foreground`, etc.). Test with `renderToStaticMarkup`: exact copy present, `sm:hidden` on the root.

- [ ] **Step 3: Button touch targets (ruling 1).** In `buttonVariants` sizes:
  - `default`: append `pointer-coarse:h-11 pointer-coarse:px-3.5`
  - `lg`: append `pointer-coarse:h-11`
  - `icon`, `icon-lg`: append `pointer-coarse:size-11`
  - `xs`, `sm`, `icon-xs`, `icon-sm`: append a hit-slop: `relative pointer-coarse:after:absolute pointer-coarse:after:-inset-2 pointer-coarse:after:content-['']` (the element's visual size is unchanged; `-inset-2` adds 8 px each side: 28 px → 44 px for `sm`/`icon-sm`; for `xs`/`icon-xs` (24 px) use `-inset-2.5`).
  Check that `relative` doesn't break any `absolute`-positioned button usage (grep for `absolute` on Button className; if a caller positions a Button absolutely, `tailwind-merge` keeps the caller's `absolute` since `cn` merges — verify with one test).
  Test (`button-touch.test.tsx`): for each size, the rendered class list contains its coarse classes, and stripping every `pointer-coarse:` token leaves exactly the pre-change class string (pin the old strings in the test).

- [ ] **Step 4: Tabs overflow.** `tabsListVariants` base: add `max-w-full overflow-x-auto` and `[scrollbar-width:none] [&::-webkit-scrollbar]:hidden`. `TabsTrigger`: add `shrink-0` so labels keep their natural width and the list scrolls instead of forcing the page wider (keep `flex-1` so tabs still share space when they fit). In `page-header.tsx`, the tabs slot wrapper gets `min-w-0 max-w-full overflow-x-auto`. Tests: classes present on list and trigger; PageHeader with `tabs` renders the wrapper classes.

- [ ] **Step 5: Hover reveals (ruling 2).** In each listed file, replace the functional control's `opacity-0 … group-hover:opacity-100` with `pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 focus-visible:opacity-100` (keep any existing `group-focus-within` etc.). Then run `grep -rn "opacity-0" components app | grep "group-hover:opacity-100" | grep -v "pointer-fine:opacity-0"` and review every remaining hit: purely decorative overlays may stay; any clickable control must be converted. Record the grep output and your decision per hit in the report.

- [ ] **Step 6: Tier labels.** `nav-items.ts`: set `/settings/billing`, `/settings/clinic`, `/settings/audit-log` to `tier: 2` (ruling 3). `mobile-tab-bar.tsx` More sheet: for items with `tier === 3` render a small "Desktop" `Badge` (variant `secondary`) on the tile (spec §5a Rules). After this change no current trainer nav item is Tier 3, so the badge is dormant; test it with a fixture item.

- [ ] **Step 7: Verify and commit.** `npx vitest run hooks components/ui components/shared components/layout`, `npx tsc --noEmit -p tsconfig.json`, eslint on each changed file.

```bash
git commit -m "feat: add phone primitives — useIsPhone, desktop-only notice, 44px touch targets, scrolling tabs"
```

---

### Task 2: Header — search and notifications on phones

**Files:**
- Modify: `components/layout/header.tsx`, `components/notifications/notification-panel.tsx`, `components/search/command-palette.tsx` (only if it needs an `open()` entry point), tests under `components/layout/__tests__/` / `components/notifications/__tests__/`

- [ ] **Step 1: Search entry.** The header search trigger is `hidden … sm:flex` (~header.tsx:72–83) and the palette opens only by keyboard. Below `sm`, render an icon Button (`size="icon"`, `aria-label="Search"`, `Search` icon) that opens the same command palette; keep the existing wide trigger at `sm+`. If the palette's open state is internal, expose an opener the same way the existing trigger does (read how the `sm:flex` trigger opens it and reuse that exact mechanism). Test: header static render contains an element with `aria-label="Search"` and `sm:hidden`.
- [ ] **Step 2: Notifications on phones.** The bell trigger (`h-9 w-9`) → use Button `size="icon"` (now 44 px on touch). Below `sm`, open the notification list in a bottom `Sheet` (`side="bottom"`, `max-h-[85dvh]`, internal scroll, safe-area bottom padding via the existing `--safe-bottom` variable) instead of the `w-80` popover; at `sm+` keep the popover unchanged. Share one list component between both containers — no duplicated list markup. Decide container by `useIsPhone()` (behaviour: which overlay to open), defaulting to the popover on the server. Test: the shared list renders identically in both; the phone branch uses `side="bottom"`.
- [ ] **Step 3: Verify and commit** (vitest for touched dirs, tsc, eslint per file).

```bash
git commit -m "feat: reach search and notifications from the header on phones"
```

---

### Task 3: Clients — Tier 1 list, detail, progress, session review

**Files:**
- Modify: `app/(platform)/clients/page.tsx` (+ new `components/clients/client-card-list.tsx`), `app/(platform)/clients/[id]/page.tsx`, `components/calendar/client-calendar.tsx`, `components/clients/assigned-programs-list.tsx`, `app/(platform)/clients/[id]/progress/page.tsx`, `app/(platform)/clients/[id]/sessions/[sessionId]/page.tsx` (+ extracted set component if needed), tests alongside

- [ ] **Step 1: Clients list as cards on phones.** Create `ClientCardList` (same data the `DataList` rows use): each client is a full-width `Link` row — avatar, name (`truncate`, `min-w-0`), status badge, chevron — `min-h-14`, plus the existing `ClientActionsMenu` positioned so it doesn't sit inside the link (same `relative z-10` convention as `DataList`). In `clients/page.tsx` render `<div className="sm:hidden"><ClientCardList …/></div>` and wrap the existing `DataList` in `hidden sm:block`. Test: both wrappers present; card list renders name, status and the link href per client.
- [ ] **Step 2: Client detail header on phones.** `clients/[id]/page.tsx`: keep "Assign program" as the visible primary action; below `sm`, move "Message" and "Progress" into the existing overflow menu (render them in the menu with `sm:hidden` items, and the buttons with `hidden sm:inline-flex`). Test the classes on both.
- [ ] **Step 3: Client calendar on phones.** `client-calendar.tsx`: the per-event dropdown trigger (`h-5 w-5`, ~:209) → Button `size="icon-xs"` (gains hit-slop from Task 1); nav buttons (~:306, :316) → `size="icon"`. Disable drag on phones: extract `export function isCalendarDraggable({ readOnly, isPhone }: { readOnly: boolean; isPhone: boolean }): boolean` (returns `!readOnly && !isPhone`), use it for `draggableAccessor`/`resizable`, with `useIsPhone()` in the component. Tapping an event still opens its menu/editor (existing behaviour). Unit-test the helper.
- [ ] **Step 4: Assigned programs row.** `assigned-programs-list.tsx` ~:61–81: row gets `flex-wrap gap-y-2`; pill+badge group `shrink-0`; delete → Button `size="icon-sm"`.
- [ ] **Step 5: Progress page (broken).** `clients/[id]/progress/page.tsx`: tab labels get a short phone form — "Photos (n)", "Metrics (n)", "Notes (n)" via `<span className="sm:hidden">…</span><span className="hidden sm:inline">…full label…</span>`; the client header row (~:51–72) gets `flex-wrap gap-y-2`. Test: short and long labels present with the right classes; header row has `flex-wrap`.
- [ ] **Step 6: Session review sets on phones.** The per-exercise 5-column `SetTable` (~:319): below `sm` render one compact card per set (set #, target vs actual reps, weight, status badge — two lines max), keep the table at `sm+` (`hidden sm:block`). Extract the set data mapping into a pure function used by both, and test it plus the wrappers.
- [ ] **Step 7: Verify and commit.** vitest for `app/(platform)/clients components/clients components/calendar`, tsc, eslint per file, `npm run build`.

```bash
git commit -m "feat: phone-first client list, detail, progress tabs and session review"
```

---

### Task 4: Programs and exercises — Tier 3 gates, schedule on phones, overflow fixes

**Files:**
- Modify: `app/(platform)/programs/[id]/edit/page.tsx`, `app/(platform)/programs/new/page.tsx`, `app/(platform)/programs/generate/page.tsx`, `app/(platform)/programs/upload/page.tsx`, `app/(platform)/exercises/bulk-import/page.tsx`, `components/programs/program-detail-view.tsx`, `components/programs/program-schedule-view.tsx`, `components/programs/program-editor.tsx`, `components/programs/generate-program-form.tsx`, `components/exercises/bulk-import-form.tsx`, `components/exercises/exercise-grid.tsx`; tests alongside
- Possibly create: `components/programs/program-structure-readonly.tsx` (extracted from `program-detail-view.tsx`'s Overview accordion)

- [ ] **Step 1: Read-only program structure.** Extract the Overview tab's week → workout → block → exercise accordion from `program-detail-view.tsx` (~:390–613) into `ProgramStructureReadonly` without behaviour changes (props: the same program data it reads today; trainer-only actions like "Start Session" stay in `program-detail-view.tsx` via an optional render prop or are omitted in the read-only version — choose the smaller change and say which). `program-detail-view.tsx` uses the extracted component; its existing tests must stay green.
- [ ] **Step 2: Gate the builder (Tier 3).** `programs/[id]/edit/page.tsx` and `programs/new/page.tsx`: render `<DesktopOnlyNotice />` right under the `PageHeader`; for edit, render `<div className="sm:hidden"><ProgramStructureReadonly …/></div>` below it (for new there's nothing to show yet — notice only); wrap the existing editor in `<div className="hidden sm:block">`. Tests: exactly one notice and one `hidden sm:block` wrapper per page (Review Focus 2).
- [ ] **Step 3: Gate authoring-only tools.** `programs/generate`, `programs/upload`, `exercises/bulk-import`: notice under the header, existing tool in `hidden sm:block`. Same tests.
- [ ] **Step 4: Trainer schedule tab on phones.** `program-schedule-view.tsx`: below `sm`, render a day-by-day agenda list using the pattern `ClientProgramScheduleView` already uses (its `sm:hidden` list at ~:81–142; reuse its row markup or extract a shared list component from it — no copy-pasted blocks), tapping a session opens the same edit dialog the calendar opens on event click; the drag calendar stays at `sm+` (`hidden sm:block`). Also pass `isCalendarDraggable`-style gating if the calendar ever renders on a phone-width tablet in portrait (reuse the helper from Task 3 by moving it to `lib/utils/calendar-drag.ts` if both need it). Test: agenda list renders sessions in date order; wrappers present.
- [ ] **Step 5: Overflow fixes (apply regardless of the gates — tablets and resized windows still see these):**
  - `program-editor.tsx` ~:631 footer: `flex flex-col-reverse gap-2 sm:flex-row sm:justify-end`.
  - `generate-program-form.tsx` ~:703–808 circuit row: `flex-wrap`; name input `basis-full sm:basis-auto`; the three count groups stay together on the second line.
  - `bulk-import-form.tsx` ~:924: add `min-w-0` to the truncating `<p>`.
  - `exercise-grid.tsx` ~:174 bulk-select pill: `max-w-[calc(100vw-2rem)] flex-wrap justify-center` on the inner pill; the "N selected" text `basis-full text-center sm:basis-auto` below `sm`.
  Add class-level tests for each (render the smallest component that contains the row, with minimal props/mocks).
- [ ] **Step 6: Verify and commit.** vitest for `components/programs components/exercises app/(platform)/programs app/(platform)/exercises`, tsc, eslint per file, `npm run build`.

```bash
git commit -m "feat: gate desktop-only program tools on phones, add a phone schedule, fix program and exercise overflow"
```

---

### Task 5: Tier 2 and remaining cramped screens

**Files:**
- Modify: `components/nutrition/meals-table.tsx`, `components/exercises/exercise-edit-form.tsx`, `app/(platform)/check-ins/new/page.tsx`, `components/audit-log/audit-log-table.tsx`, `components/habits/add-habit-dialog.tsx`, `components/messages/message-thread.tsx` (composer only, if not already covered by Task 1's Button change); tests alongside

- [ ] **Step 1:** `meals-table.tsx` ~:200–224: raw `p-1` icon buttons → `Button size="icon-sm" variant="ghost"` with `aria-label`s (hit-slop from Task 1). Same for `exercise-edit-form.tsx` media delete buttons (~:412–418, :453–467), keeping their overlay positioning (caller `absolute` must win over the primitive's `relative` — verify).
- [ ] **Step 2:** `check-ins/new/page.tsx` ~:339–356: row gets `flex-wrap gap-2`; up/down/delete → `Button size="icon-sm" variant="ghost"` with `aria-label`s ("Move up", "Move down", "Delete question").
- [ ] **Step 3:** `audit-log-table.tsx`: Details column `hidden sm:table-cell` (ruling 3); pagination links get `inline-flex min-h-11 items-center px-4` on coarse pointers (`pointer-coarse:min-h-11`).
- [ ] **Step 4:** `add-habit-dialog.tsx` icon picker buttons `h-10 w-10` → add `pointer-coarse:size-11`.
- [ ] **Step 5:** Confirm the message composer's mic/send buttons use Button `size="icon"` (so Task 1 makes them 44 px on touch); if they use raw buttons, convert them.
- [ ] **Step 6: Verify and commit.** vitest for touched dirs, tsc, eslint per file.

```bash
git commit -m "fix: enlarge touch targets and stop overflow on remaining cramped trainer screens"
```

---

### Task 6: Full verification and QA checklist

- [ ] `npx tsc --noEmit -p tsconfig.json`; `npx vitest run` (only the 2 known `client-dashboard-render` timezone failures allowed); `npm run build`; eslint on every file changed since the plan base.
- [ ] Repo grep: no `opacity-0` + `group-hover:opacity-100` on a functional control without `pointer-fine:`; no new unprefixed fixed widths over `w-[358px]`/`max-w-xs` in files touched by this plan.
- [ ] If a dev server can be started without signing in, check the public pages at 390 px for regressions from the primitive changes (Playwright `browser_resize` 390×844). Do not sign in or create accounts. If the app needs sign-in for trainer pages, skip and say so.
- [ ] Append a "Trainer phone QA (390 px)" checklist to `mobile/README.md`: for each Tier 1 route one line of what to tap; for each Tier 3 route "notice shows, no horizontal scroll"; plus "switch a laptop browser to a touch-device emulation and confirm button sizes grow only there".
- [ ] Commit: `docs: add the trainer phone QA checklist`.

---

## Self-review

- **Spec §5a coverage:** audit first (done, table above); Tier 1 — inbox/threads (Task 1 hover fix, Task 5 composer), clients list and detail (Task 3), schedule (Task 3 client calendar on phones; trainers have no global calendar, `/calendar` redirects), check-in review (works), completed workout review (Task 3 step 6), quick assign (audit: works), notifications list (Task 2). Tier 2 — program detail read (works) with phone schedule (Task 4); exercise library (Tasks 1, 4); analytics (works); nutrition review (Task 5); settings (works, ruling 3). Tier 3 — builder, drag reschedule, bulk import, AI wizard (Task 4); `useIsPhone()` and `DesktopOnlyNotice` (Task 1). Rules — tier recorded in nav-items with More-sheet label (Task 1); QA checklist (Task 6). Spec Tier 2 "edit sets/reps via a bottom sheet" on program detail is **not** included: the builder is Tier 3 and program detail has no inline editing today; recorded as a follow-up.
- **Review Focus:** 1 → Task 1 step 3; 2 → Task 4 steps 2–3; 3 → Task 1 step 5 and Task 6; 4 → Task 1 step 4, Task 3 step 5; 5 → Task 3 step 3, Task 4 step 4.
- **Type consistency:** `useIsPhone`, `PHONE_QUERY`, `DesktopOnlyNotice`, `isCalendarDraggable`, `ProgramStructureReadonly`, `ClientCardList` are named identically in every task.

---

## Execution record (2026-09-27)

Commits (unpushed): 4be27f5 primitives · 545a7bb header · 8e56603 clients · 326e5a0 programs/exercises · 22ca8ff + a74cc16 remaining screens · 8981c68 QA checklist · 5476f29 final fix wave.

Rulings and deviations during execution:
- `isCalendarDraggable` lives in `lib/utils/calendar-drag.ts` (shared by client calendar and program schedule).
- Tabs scroll only below `sm` (`max-sm:overflow-x-auto`): unprefixed overflow would clip the line-tab underline on laptops. Tabs can still overflow at 640–1023 px (QA item).
- Hover reveals use `pointer-fine:focus-visible:` / `pointer-fine:disabled:` so keyboard focus and disabled styling behave as before.
- Desktop-size exceptions accepted: notification bell kept at 36 px via `icon-lg`; converted icon buttons use `icon-xs` with `size-N` icons to keep their size; habit delete 24→28 px and meal Edit 22→24 px; calendar event trigger 20→24 px.
- The overview tab is `keepMounted` so the read-only program outline keeps its open weeks/workouts.
- Tight clusters of small buttons get `pointer-coarse:` gaps so 44 px hit areas never overlap (the meal row delete had no confirm; 11 clusters fixed).
- Phone-only header menu items render through `components/shared/phone-only.tsx` so they're absent from the desktop DOM.

Open follow-ups:
- Program schedule agenda on phones opens the session dialog but has no duplicate/delete (calendar pill menu actions).
- Workout editor drag grip is 36 px on touch (not 44); workout-editor-panel expand/history icons render at 12 px (pre-existing icon-xs svg rule).
- The header's phone search button and notifications sheet also show for clients (shared header) — owner to confirm.
- Check-ins, habits and assessments still have no navigation entry (owner decision).
- Hidden desktop tools still mount on phones (builder keydown listener, generate equipment fetch) — harmless.
- No signed-in browser pass was possible; run the README §15 checklist on a device.
