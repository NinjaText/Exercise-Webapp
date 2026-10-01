# Premium UI Redesign — Design

**Date:** 2026-10-02
**Status:** Direction approved in chat 2026-10-02 (scope B: whole app; stay on branch `club-orgs`)
**Builds on:** `docs/superpowers/specs/2026-09-18-ui-design-system-overhaul-design.md`. That spec's semantic status tokens, `lib/ui/status.ts`, `PageShell`/`PageHeader`/`SectionCard`/`DataList`/`FormSection`/`EmptyState`/`StatCard`, and the `no-raw-palette` lint rule all stay.

## 1. Goal and success criteria

The owner says the UI "sucks". It must look **premium, clean and professional** across the whole product: trainer portal, client portal, club member flows, onboarding/auth, billing and admin.

Success means a reasonable reviewer looking at screenshots (1440×900, 1280×800, 390×844) sees all of the following:
1. **No dead space.** No large empty bands above or below primary content on onboarding/auth. No narrow content floating in a wide viewport, unless it is a deliberately sized form.
2. **One spacing rhythm.** Gutters, section gaps, card padding and form field spacing are the same on every page.
3. **Clear hierarchy.** Every page has one obvious title, one obvious primary action, and quieter secondary actions.
4. **Restrained, consistent surfaces.** The same cards, tables, tabs, inputs, buttons, badges and empty states everywhere.
5. **Polished first-run experience.** Sign-in, onboarding, club join and billing look like a funded SaaS product.
6. **No regressions.** Same features and data. Org and club branding still applies. Tests, tsc, `lint:palette` and build stay green.

## 2. Visual direction: "quiet premium" (Linear / Stripe / Notion register)

### 2.1 Tokens (`app/globals.css`)
- **Canvas:** a soft neutral app background, slightly cooler and lighter than today. All hard-coded `bg-[oklch(0.97_0.005_247)]` page backgrounds are replaced by a `--canvas` token (`bg-canvas`).
- **Surfaces:**
  - `--surface` is white.
  - `--surface-muted` is used for subtle fills: table headers and inset panels.
  - Borders become **hairline** (`--border` lighter). Add `--border-strong` for inputs on focus or hover.
- **Elevation scale (new):** `--shadow-xs`, `--shadow-sm`, `--shadow-md`, `--shadow-lg`, exposed as utilities. Cards use `xs`, popovers and menus `md`, dialogs `lg`. No ad-hoc rgba shadows.
- **Radius:** keep `--radius` 0.75rem as the base. Inputs and buttons use `md`, cards `xl`, dialogs `2xl`.
- **Primary:** keep the indigo brand hue, slightly refined for contrast. Org branding still overrides it.
- **Typography scale (named utilities, used everywhere):**
  - `text-display` 30/36 semibold, used sparingly on marketing/onboarding hero
  - `text-title` 22/28 semibold (page titles)
  - `text-heading` 16/24 semibold (section and card titles)
  - `text-body` 14/22
  - `text-label` 13/20 medium
  - `text-caption` 12/16 (muted)
  - Lexend stays for display and title; Inter for everything else. Tabular numbers for stats and tables.
- **Spacing scale:** a 4px base. The canonical set is page gutter 24 (≥1024px) / 32 (≥1536px) / 16 (mobile), section gap 24, card padding 20 (compact 16), form field gap 16, label↔input 6.

### 2.2 App shell
- **Sidebar:** a lighter, refined sidebar. A neutral-dark surface stays acceptable if it reads premium; the deciding rule is contrast and calm.
  - Grouped nav (primary / account) with small group labels.
  - 32px rows and clear active state (filled pill and accent marker).
  - The org identity block on top. The user block at the bottom with the account menu.
  - The width stays at 256px. A collapsible icon rail at ≥1024px is a stretch goal, not required.
- **Top bar:** slim (56px) with breadcrumbs left and search, notifications and avatar right. No duplicated title.
- **Content area:** `<main>` owns the gutter (§2.1 scale). `PageShell` widths are `narrow` 720px (forms/settings), `default` 1440px, and `full`. All pages use `PageShell`.
- **Mobile:** the bottom tab bar is kept and restyled. The drawer `<aside>` gets `h-full` (known pre-existing bug: it collapses at 505px).

### 2.3 Components (refresh in place; same APIs where possible)
- **Button:** sizes sm 32 / default 36 / lg 40. Variants primary, secondary (surface + hairline), ghost, destructive. Focus ring uses the token.
- **Input, Select, Textarea:** 36px height, hairline border, `border-strong` on hover, ring on focus, consistent error text slot.
- **Card / SectionCard:** surface, hairline border, `shadow-xs`, `rounded-xl`. A header row with title, optional description and a right-side actions slot. Padding 20.
- **DataList / Table:** muted header row, 44px rows, subtle row hover, sticky header option kept, consistent empty state.
- **Tabs:** one style, a line underline under page headers and segmented controls inside cards.
- **Badge / StatusBadge:** pill, 22px, soft tinted backgrounds from status tokens.
- **Dialog / Sheet:** `rounded-2xl`, `shadow-lg`, title/description/footer layout with right-aligned actions.
- **EmptyState:** icon in a soft circle, title, one sentence, one action.
- **StatCard:** label (caption), value (tabular, title size), delta/trend chip.
- **Skeletons:** match the final layout dimensions.

### 2.4 Onboarding, auth and first-run (fixes the explicit complaint)
- New `AuthShell` component, used by sign-in, sign-up, every onboarding page, club join, the club-trainer onboarding, billing subscribe/success/cancel, account-deactivated and account-deleted.
  - **Desktop (≥1024px):** a full-height split.
    - **Left brand panel, 40%:** org/club logo, a short headline and supporting line, and an optional testimonial or feature bullets. Org or club branding colour applies.
    - **Right panel, 60%:** the form column (max 520px, or 640px for multi-field forms), **top-aligned with a fixed top offset** (not vertically centred, which caused the big top/bottom gaps). Footer links sit at the bottom of the right panel.
  - **Mobile:** a single column with the logo header, the form, and no brand panel.
- **Multi-field onboarding** (trainer, client and club-member forms) becomes **steps** (for example "About you" → "Goals & health" → "Preferences"):
  - progress indicator at the top
  - a fixed bottom action bar with Back and Continue
  - client-side validation per step
  - **The same server action and payload; no data-model changes.**
- Clerk `<SignIn>`/`<SignUp>` are themed via `clerkAppearance` (`lib/ui/clerk-appearance.ts`) to match inputs and buttons, and sit inside `AuthShell`.

### 2.5 Branding interaction
Org and club branding (display name, colour, logos) must keep working in the sidebar, `AuthShell` and emails. The brand colour only drives primary accents. Contrast guards stay (`lib/branding/color.ts`).

## 3. Scope by stage

Each stage is shippable on its own, reviewed, and checked visually in a browser.

| Stage | Surfaces |
|---|---|
| 1. Foundation | tokens, typography/spacing utilities, `components/ui/*` refresh, shared components (`PageShell`, `PageHeader`, `SectionCard`, `DataList`, `FormSection`, `EmptyState`, `StatCard`, `StatusBadge`, `ConfirmDialog`), app shell (`sidebar`, `header`, `mobile-tab-bar`, platform + admin layouts), canvas token replacement |
| 2. First impressions | `AuthShell`; `/sign-in`, `/sign-up`; `/onboarding` (trainer), `/onboarding/client`, `/onboarding/club-trainer`, `/onboarding/patient`; `/join/[slug]` + complete + not-open; `/billing`, `/billing/success`, `/billing/cancel`; `/account-deactivated`, `/account-deleted`; `/p/[slug]` + success (public sales page) |
| 3. Trainer core | `/dashboard` (trainer), `/clients`, `/clients/[id]` (+ adherence/outcomes/progress/sessions), `/programs`, `/programs/[id]`, program builder (new/edit/generate/upload) |
| 4. Trainer secondary | `/exercises` (+ new/edit/bulk-import/[id]), `/calendar`, `/nutrition` (+ [clientId]), `/analytics`, `/check-ins` (+ new/[id]/respond), `/assessments`, `/habits`, `/messages` (+ thread), `/settings/*` |
| 5. Client portal | client `/dashboard` (incl. coaching card), `/programs`, `/sessions/[id]` workout mode, `/calendar`, `/nutrition`, progress, `/messages` for coached members |
| 6. Admin | `/admin/*` incl. clubs, users, exercises, programs, global programs, analytics, audit log |

The marketing pages `/`, `/about`, `/privacy` and `/terms` are **out of scope** unless they share `AuthShell` or shell components. They must not break.

## 4. Constraints
- **Never** commit or touch git state (the owner commits). Work on `club-orgs`.
- Never run `prisma db push`, nor anything against live services from scripts. A local `next dev` against `.env` is allowed **only** for owner-attended visual checks, where the owner signs in. Never write data during visual checks.
- No behaviour or data changes. Server actions, payloads, routes and permissions are unchanged. If a layout change needs a component split, keep the existing exports working.
- Design tokens only. `npm run lint:palette` stays at 0. No new raw hex or oklch in components; values live in `globals.css`.
- Never import a plain value from a `"use client"` module into a server component (see the earlier `NaN oz` incident).
- Accessibility: visible focus rings, labels on all inputs, 4.5:1 text contrast, hit targets ≥ 32px (44px on mobile primary actions), `prefers-reduced-motion` respected.
- Performance: no new heavy dependencies. Use the existing shadcn/base-ui, lucide and Tailwind.

## 5. Verification
- **Every stage:** `TZ=UTC npx vitest run`, `npx tsc --noEmit`, `npm run lint:palette`, eslint on changed production files, and `DATABASE_URL="mongodb://127.0.0.1:1/none" npx next build`.
- **Visual check per stage:**
  - Run `next dev` on port 3100.
  - Capture screenshots at 1440×900, 1280×800 and 390×844 for every surface in the stage.
  - Public pages can be captured directly. Authenticated pages are captured in the owner's signed-in Chrome session (claude-in-chrome).
  - A reviewer checks the screenshots against §1. Spacing defects found are fixed in the same stage.
- Existing render tests are updated, not deleted. Add render tests for `AuthShell` and the step forms (step navigation, same payload submitted).
