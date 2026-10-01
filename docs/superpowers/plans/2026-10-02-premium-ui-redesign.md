# Premium UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the whole app look premium, clean and professional. That means a refreshed design-token foundation, a rebuilt app shell, a new `AuthShell` and step-based onboarding, then a page-by-page pass over the trainer, client and admin surfaces. Behaviour does not change.

**Architecture:** Tokens and utilities live in `app/globals.css`. Primitives in `components/ui/*` and shared layout components in `components/shared/*` and `components/layout/*` are refreshed in place, keeping their APIs. Pages are then migrated onto them. Each stage ends with automated checks and a screenshot review at three widths.

**Tech stack:** Next.js App Router, Tailwind v4 (CSS-first tokens in `globals.css`), shadcn on base-ui, lucide-react, Clerk v7 `appearance`, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-02-premium-ui-redesign-design.md`. It is binding; §2 holds the token values and component specs, §3 the stage scope.

## Global Constraints

- **Never** run `git add`/`commit`/`stash`/`checkout`/`reset`. Leave everything uncommitted on `club-orgs`.
- Never run `prisma db push` or any script against live services. Visual checks use `next dev` and are run by the controller with the owner present; implementers must not start dev servers.
- **No behaviour changes.** Server actions, payloads, routes, permissions and data are unchanged. Existing component exports keep working. Splitting a component is fine; deleting a public export used elsewhere is not.
- Use design tokens only. `npm run lint:palette` must stay at 0. Put no raw hex or oklch in components; add a token in `globals.css` instead.
- Never import a plain value from a `"use client"` module into a server component.
- Accessibility per spec §4: focus rings, labels, contrast ≥ 4.5:1, targets ≥ 32px (44px for mobile primary actions), reduced motion respected.
- Org and club branding must keep working: the sidebar identity, `AuthShell` brand panel, brand-colour accents and the contrast guard.
- Every task must keep green:
  - `TZ=UTC npx vitest run`, updating render tests whose class or markup assertions change. Never delete a behavioural assertion.
  - `npx tsc --noEmit`
  - `npm run lint:palette`
  - eslint on the changed production files
- The last task of each stage also runs `DATABASE_URL="mongodb://127.0.0.1:1/none" npx next build`.

## Review Focus

1. **Onboarding/auth on a 1440×900 laptop:** there must be no large empty band above or below the form, and no wasted side space. The brand panel and form column must fill the viewport (Stage 2).
2. **Step forms:** they must submit the **identical payload** to the same server action as today. Validation errors must stay on the right step and never lose entered data (Stage 2).
3. **Branded orgs:** a club with a custom colour and logo must still look intentional, with readable contrast in the sidebar, `AuthShell` and buttons (Stages 1–2).
4. **Mobile (390px):** no horizontal scroll. The bottom tab bar must not cover content, and the fixed onboarding action bar must respect the safe area (all stages).
5. **Dense data pages** (clients list, program builder, calendar, admin tables) must stay usable at 1280px: no clipped columns, and sticky headers must still work (Stages 3, 4 and 6).

---

## Stage 1: Foundation

### Task 1.1: Tokens, elevation, typography and spacing utilities
**Files:**
- `app/globals.css`
- `lib/ui/clerk-appearance.ts` (tokens only)
- a new `components/shared/__tests__/tokens.test.ts` if useful

- [ ] Add the canvas, surface and border tokens from spec §2.1: `--canvas`, `--surface`, `--surface-muted`, `--border-strong`. Expose them as Tailwind theme colours (`bg-canvas`, `bg-surface`, `bg-surface-muted`, `border-strong`). Refine `--border` to be lighter, and keep dark-mode counterparts in `.dark`.
- [ ] Add the elevation scale `--shadow-xs/sm/md/lg` and expose it as `shadow-xs/sm/md/lg` theme shadows. Replace ad-hoc rgba shadows found in `globals.css` (for example the chart tooltip).
- [ ] Add the typography utilities `text-display/title/heading/body/label/caption` per spec §2.1 as `@utility` classes. Title and display use Lexend.
- [ ] Replace every `bg-[oklch(0.97_0.005_247)]` (grep the repo) with `bg-canvas`.
- [ ] Keep the existing laptop density scale (root font-size on app shells) and confirm the new utilities scale with it.
- [ ] Verify the global checks.

### Task 1.2: Primitive refresh (`components/ui/*`)
**Files:** `components/ui/{button,input,textarea,select,card,badge,tabs,dialog,sheet,dropdown-menu,popover,table,skeleton,tooltip,alert,alert-dialog,checkbox,switch,radio-group,separator,label}.tsx`, plus their tests if any.

- [ ] Implement the spec §2.3 sizes, variants, radius, border, focus and elevation, keeping the existing prop APIs and variant names. Add `secondary` to Button if it is missing, and map any existing `outline` variant to the new hairline secondary look. Don't remove `outline`.
- [ ] Inputs, Select and Textarea: 36px height, hairline border, `border-strong` on hover, the focus ring token, and an `aria-invalid` error style.
- [ ] Dialog and Sheet: `rounded-2xl`, `shadow-lg`, consistent header, body and footer padding (24), with footer actions right-aligned.
- [ ] Tabs: the `line` variant for page headers and a `segmented` variant inside cards. Keep any existing variant names working.
- [ ] Badge: a 22px pill with a soft tinted background.
- [ ] Verify the global checks. Update snapshot or class assertions only where styling legitimately changed.

### Task 1.3: Shared layout components
**Files:** `components/shared/{page-shell,page-header,page-toolbar,section-card,data-list,data-table,form-section,empty-state,stat-card,status-badge,confirm-dialog,loading-skeleton,pagination-bar}.tsx`

- [ ] `PageShell` widths: `narrow` 720px, `default` 1440px, `full`. Section gap 24.
- [ ] `PageHeader`: `text-title` title, `text-body` muted description, the actions row aligned to the title baseline, and the `meta` and `tabs` slots styled per spec. No duplicate title in the top bar.
- [ ] `SectionCard`: surface, hairline border, `shadow-xs`, `rounded-xl`, a header with title, description and actions, padding 20 (compact 16).
- [ ] `DataList`/`DataTable`: muted sticky header, 44px rows, hover state, consistent empty state.
- [ ] `FormSection`: a two-column layout on ≥1024px (label and description on the left, fields on the right), stacked on mobile.
- [ ] `EmptyState` and `StatCard` per spec §2.3.
- [ ] Verify the global checks.

### Task 1.4: App shell
**Files:** `components/layout/{sidebar,header,mobile-tab-bar,nav-items}.tsx`, `app/(platform)/layout.tsx`, `app/admin/layout.tsx`, `components/admin/{admin-sidebar,admin-mobile-nav,admin-top-bar}.tsx`, `components/branding/org-identity.tsx`

- [ ] Sidebar per spec §2.2:
  - grouped nav with group labels
  - 32px rows, an active pill plus an accent marker
  - org identity on top, the user/account block at the bottom
  - badge styling
  - mobile drawer `<aside>` gets `flex h-full` (pre-existing bug)
- [ ] Top bar: 56px, breadcrumbs left, search/notifications/avatar right.
- [ ] `<main>` gutter: 16 on mobile, 24 at ≥1024px, 32 at ≥1536px. The bottom padding still clears the mobile tab bar and safe area.
- [ ] Admin shell aligned to the same system: it keeps its distinct "Super Admin" identity but uses the same spacing and components.
- [ ] Verify the global checks, then run `next build`.

### Task 1.5: Stage 1 visual check (controller, owner present)
- [ ] The controller starts `next dev -p 3100` and captures the dashboard, clients, programs and settings (trainer) and the dashboard (client) at 1440, 1280 and 390. A reviewer checks them against spec §1. Defects become Stage 1 fix-round findings.

## Stage 2: First impressions

### Task 2.1: `AuthShell`
**Files:** a new `components/auth/auth-shell.tsx` and its test; `lib/ui/clerk-appearance.ts`.

- [ ] Build `AuthShell` per spec §2.4: the 40/60 desktop split, a full-height brand panel (logo, headline, supporting copy, optional bullets), and the form column top-aligned with a fixed top offset (max-w 520px, or 640px with `size="wide"`). The footer slot sits at the bottom of the right panel.
- [ ] On mobile it is a single column with a logo header.
- [ ] Props: `branding` (BrandingViewModel), `headline`, `subhead`, `bullets?`, `size?`, `footer?`, `children`.
- [ ] Theme Clerk through `clerkAppearance` (input, button, card-less layout) so `<SignIn>`/`<SignUp>` blend in.
- [ ] Add a render test covering the brand panel's presence, the branding name, and that the form sits in the right column.

### Task 2.2: Sign-in, sign-up and account pages
**Files:** `app/sign-in/[[...sign-in]]/page.tsx`, `app/sign-up/[[...sign-up]]/page.tsx`, `app/account-deactivated/page.tsx`, `app/account-deleted/page.tsx`

- [ ] Move them onto `AuthShell` with appropriate copy.

### Task 2.3: Step-based onboarding
**Files:**
- `app/onboarding/{layout,page}.tsx`, `app/onboarding/client/page.tsx`, `app/onboarding/club-trainer/page.tsx`, `app/onboarding/patient/page.tsx`
- `components/onboarding/{onboarding-form,client-onboarding-form,club-trainer-onboarding-form}.tsx`
- a new `components/onboarding/step-form.tsx` (generic stepper: progress, step slots, fixed Back/Continue bar, per-step validation) and its tests

- [ ] Every onboarding page uses `AuthShell` with the org/club branding that page already resolves today.
- [ ] Client onboarding splits into steps:
  1. About you: name, phone, DOB
  2. Health & goals: limitations, diagnosis, pain, injury, surgery
  3. Training: equipment, goals, activity, occupation
  4. Review and submit
- [ ] Trainer onboarding: about you, then organization. The club trainer form stays one short step.
- [ ] **The payload is unchanged.** Tests assert that the server action is called with exactly the same object as before for a fully filled form, and that the Back button keeps values.

### Task 2.4: Club join, billing and public sales pages
**Files:**
- `app/join/[slug]/{page,join-code-form,club-not-open}.tsx`, `app/join/[slug]/complete/{page,activate-org}.tsx`
- `app/billing/{layout,page,member-billing-view,member-billing-buttons}.tsx`, `app/billing/success/page.tsx`, `app/billing/cancel/page.tsx`, `components/billing/pricing-cards.tsx`
- `app/p/[slug]/**`

- [ ] All of these move onto `AuthShell` (or a matching marketing card layout for `/p/[slug]`).
- [ ] Billing pages get a premium pricing card: the plan name, the large price, what's included, the primary CTA, and the status banners restyled with status tokens.
- [ ] Trainer pricing cards (`components/billing/pricing-cards.tsx`) get the same treatment.
- [ ] Verify the global checks, then run `next build`.

### Task 2.5: Stage 2 visual check (controller)
- [ ] Capture `/sign-in`, `/sign-up`, `/onboarding` (in its unauthenticated state where it renders), `/join/<test-slug>` (not-open state), `/billing` member and trainer views (owner signed in), and `/account-deactivated` at 1440, 1280 and 390. Review against Review Focus 1, 3 and 4.

## Stage 3: Trainer core
**Tasks**, one per area. Each migrates pages fully onto Stage 1 components, fixes spacing, applies the hierarchy rules (one primary action), and runs the global checks:
- [ ] **3.1 Trainer dashboard:** `app/(platform)/dashboard/page.tsx`, `components/dashboard/trainer-dashboard*.tsx`, `todays-priorities-card`, `week-workouts-card`, `ai-insights-*`, `coaching-requests-card`, `recent-messages-list`. Use a clear grid of StatCards, then priority lists. It must hold up on 13–14" laptops (the existing density scale; 3+ column grids at `xl`).
- [ ] **3.2 Clients list and client detail:** `app/(platform)/clients/**`, `components/clients/**` (including `client-coaching-panel`), adherence, outcomes, progress and the session detail.
- [ ] **3.3 Programs list and detail:** `app/(platform)/programs/{page,[id]/page}.tsx`, `components/programs/**` list and detail.
- [ ] **3.4 Program builder:** new, edit, generate and upload pages and builder components. Keep it dense but clean, with sticky toolbars, and verify at 1280.
- [ ] **3.5 Stage 3 visual check (controller):** the pages above at 1440, 1280 and 390, signed in as a trainer.

## Stage 4: Trainer secondary
- [ ] **4.1 Exercises:** list, detail, new, edit and bulk-import.
- [ ] **4.2 Calendar.**
- [ ] **4.3 Nutrition:** trainer overview and per-client.
- [ ] **4.4 Analytics.**
- [ ] **4.5 Check-ins** (list, new, detail, respond), **assessments** and **habits**.
- [ ] **4.6 Messages:** inbox and thread. Use a two-pane layout on desktop with a clean composer.
- [ ] **4.7 Settings:** all tabs. Use `FormSection` two-column layouts, including branding, notifications, billing, organization and audit log.
- [ ] **4.8 Stage 4 visual check (controller).**

## Stage 5: Client portal
- [ ] **5.1 Client dashboard:** includes the coaching card, week strip, trial banner and trainer banner.
- [ ] **5.2 Workout mode:** `app/(platform)/sessions/[id]`, `components/workout/**`. Phone-first, with large touch targets and a calm focus layout.
- [ ] **5.3 Client programs, calendar, nutrition and progress.**
- [ ] **5.4 Client messages** (coached club members and trainer-org clients).
- [ ] **5.5 Stage 5 visual check (controller):** signed in as a client, with the 390 width prioritised.

## Stage 6: Admin
- [ ] **6.1 Admin overview, users and analytics.**
- [ ] **6.2 Admin exercises, programs and global programs.**
- [ ] **6.3 Admin clubs:** list, new, detail, trainer controls and price fields. Admin audit log.
- [ ] **6.4 Stage 6 visual check (controller), then a final whole-branch review and the hand-off note.**
