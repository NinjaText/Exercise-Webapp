# Per-Organization Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an organization set a display name, logo set and primary color, and apply that identity across the trainer and client apps, PDFs and client emails — safely (WCAG AA by construction, no CSS/HTML injection), fast (one cached DB read per request, no flash), and reversibly.

**Architecture:** A new `Organization` Prisma model (keyed by `clerkOrgId`) becomes the canonical org profile + branding record, replacing Clerk `publicMetadata` reads and the dead `CoachBranding` model. A pure `lib/branding/` module derives the whitelisted brand tokens (light + dark) from one hex color in OKLCH and emits a strictly-formatted CSS block; `components/branding/brand-style.tsx` injects it from `app/(platform)/layout.tsx`. `lib/services/branding.service.ts` wraps the DB read in `React.cache` + `unstable_cache` with a per-org tag that Server Actions expire via `updateTag`. Logos are validated and re-encoded to PNG with `sharp` in a Route Handler, staged to R2 under `branding-pending/`, and confirmed by a Server Action (the repo's voice-memo pattern). A `/settings/branding` page with live preview drives it all.

**Tech Stack:** Next.js 16.1.6 App Router (Server Components, Server Actions, Route Handlers, `unstable_cache`/`updateTag`), React 19, Prisma 6 on MongoDB (`prisma db push`), Clerk v7, Tailwind v4 oklch tokens, `culori` (color math), `sharp` (image processing), Cloudflare R2 via `@aws-sdk/client-s3`, `@react-pdf/renderer`, Resend, Vitest 4 (node env, `renderToStaticMarkup` for components).

**Spec:** `docs/superpowers/specs/2026-09-25-org-branding-design.md` (§4 data model, §5 theming engine, §6 assets, §7 surfaces, §8 settings UX, §9 security, §12 open questions).

## Global Constraints

- **Never run `git add` or `git commit`.** The user reviews and commits every change themselves. Where a normal plan would commit, this plan says "Hand off for review".
- **Open questions in spec §12 use their recommended defaults unless the user says otherwise:** no tier gating; any TRAINER in the org may edit; "Powered by INMOTUS RX" line in the client sidebar footer; org profile moves to the DB; client emails use the org display name as the From name; SVG rejected; sales page branded; whole trainer shell branded; legacy `clerkOrgId == null` users stay on defaults.
- DB is MongoDB via Prisma — ids use `@id @default(auto()) @map("_id") @db.ObjectId`. Push schema changes with `npx prisma db push` (matches the `db:push` script), never migrations.
- **Only the whitelisted tokens in spec §5.2 may ever be emitted.** Neutral surfaces, `destructive`, and the `success/info/warning/danger/neutral` roles are never overridden.
- **User input never reaches CSS or unescaped HTML.** The only `dangerouslySetInnerHTML` in this feature is `components/branding/brand-style.tsx`, on the output of `buildBrandCss()`; a test guards that output's grammar.
- **Every action and route derives the org from the caller's DB `User.clerkOrgId`.** Never accept an org id, asset URL, or asset key that is not validated against the caller's org.
- Follow the audit-log convention: `logAudit()` after the mutation succeeds; never let logging failures break the action.
- Follow the existing mocking convention in tests: `vi.mock('@/lib/prisma', () => ({ prisma: { <model>: { <method>: vi.fn() } } }))`, `vi.mock('@clerk/nextjs/server', ...)` as in `actions/__tests__/organization-actions.test.ts`. Component tests use `renderToStaticMarkup`; do not add jsdom or testing-library.
- Use semantic tokens only in new UI (`design/no-raw-palette` is a plain error). Inline CSS custom properties are fine for the preview panel.
- Build every new page from `PageShell` + `PageHeader`; forms from `FormSection`/`FormField`; page header buttons use the Button default size.
- Never import a plain value from a `"use client"` module into a server component (put shared constants in `lib/`).
- Verification commands: `npx tsc --noEmit 2>&1 | grep -v "\.next/"` (must be empty), `npm run test` (baseline: 3 pre-existing failures in `actions/__tests__/admin-actions.test.ts`; do not add to them), `npm run lint:palette` (must pass). `npm run lint` has ~310 pre-existing errors; "lint passes" is not an exit criterion, but no *new* errors in touched files.
- `email-notifications` is merged into this branch (rebased onto main, 2026-09-25): `EmailLayout` (`organizationName`/`accent` props), `lib/email/send.ts` and `@react-email/render` are all present, so Task 24 is unblocked. Re-read the current templates before starting it; the Phase-0 inventory of emails predates the merge.
- The 3 pre-existing test failures and ~310 lint errors quoted above were measured before the rebase. Re-measure the baseline before Task 1.

---

## File map

| Path | Phase | Responsibility |
|---|---|---|
| `prisma/schema.prisma` (modify) | 0 | `ExerciseSourcePreference` enum, `Organization` model; remove `CoachBranding` + `User.branding` |
| `lib/services/organization.service.ts` (create) | 0 | `getOrganization` (lazy-create), `upsertOrganizationProfile`, `ORG_PROFILE_KEYS` |
| `lib/services/__tests__/organization.service.test.ts` (create) | 0 | |
| `actions/organization-actions.ts` (modify) | 0 | Read/write the DB record; sync `name` to Clerk; same return shapes |
| `actions/__tests__/organization-actions.test.ts` (modify) | 0 | Re-point mocks at the service |
| `actions/onboarding-actions.ts` (modify) | 0 | Create the `Organization` row at trainer onboarding |
| `app/api/webhooks/clerk/route.ts` (modify) + test | 0 | `organization.updated` → mirror `name` |
| `lib/db/scripts/migrate-org-profiles-to-db.ts` (create) | 0 | One-shot backfill from Clerk metadata |
| `package.json` (modify) | 0/1/3 | `db:migrate-org-profiles` script; `culori`, `sharp` deps |
| `app/api/workout-plans/[id]/pdf/route.ts` (modify) | 0 | Read org from DB |
| `actions/admin-actions.ts` (modify) | 0 | Drop `coachBranding.deleteMany` |
| `lib/branding/types.ts` (create) | 1 | `BrandTokens`, `ResolvedBranding`, `BRAND_TOKEN_NAMES` |
| `lib/branding/defaults.ts` (create) | 1 | Product default hex, name, `DEFAULT_BRANDING` |
| `lib/branding/color.ts` (+test) | 1 | Hex parse/validate, OKLCH helpers, contrast, `pickForeground`, `adjustForContrast` |
| `lib/branding/tokens.ts` (+test) | 1 | `deriveBrandTokens(hex)` per spec §5.2–5.3 |
| `lib/branding/css.ts` (+test) | 1 | `buildBrandCss(tokens)` with the guarded grammar |
| `lib/branding/resolve.ts` (+test) | 1 | `resolveBranding(record)` → `ResolvedBranding` |
| `lib/services/branding.service.ts` (+test) | 1 | `brandingTag`, `getOrgBranding` (cached), `getCurrentBranding` |
| `components/branding/brand-style.tsx` (+test) | 1 | `<style id="org-brand">` |
| `app/(platform)/layout.tsx` (modify) | 1/3 | Inject `BrandStyle`; `generateMetadata`/`generateViewport`; pass branding to shell |
| `app/globals.css`, `components/layout/sidebar.tsx` (modify) | 1 | `--sidebar-gradient-end` token |
| `lib/validators/branding.ts` (+test) | 2 | zod schemas |
| `lib/services/audit-log.service.ts`, `components/audit-log/audit-log-table.tsx` (modify) | 2 | `BRANDING_UPDATED`, `BRANDING_RESET` |
| `actions/branding-actions.ts` (+test) | 2/3 | `getBrandingSettings`, `saveBrandingSettings`, `resetBranding`, `confirmBrandAsset`, `removeBrandAsset` |
| `components/settings/color-field.tsx`, `brand-preview.tsx`, `branding-form.tsx` (create) | 2 | Settings UI |
| `app/(platform)/settings/branding/page.tsx` (create) | 2 | Page |
| `components/layout/sidebar.tsx`, `app/(platform)/settings/clinic/page.tsx`, `components/settings/organization-profile-form.tsx`, `app/page.tsx` (modify) | 2 | Nav entry, copy, remove logo field, marketing bullet |
| `lib/branding/asset-kinds.ts` (+test), `lib/branding/assets.ts` (+test) | 3 | As built, split in two: `asset-kinds.ts` (browser-safe — kinds, key helpers, `isOwnAssetUrl`) + `assets.ts` (server-only — `processBrandAsset` with `sharp`) |
| `app/api/branding/assets/route.ts` (+test) | 3 | Upload → validate → re-encode → R2 `branding-pending/` |
| `hooks/use-brand-asset-upload.ts`, `components/settings/logo-uploader.tsx` (create) | 3 | Upload UX |
| `components/branding/org-identity.tsx`, `org-mark.tsx` (+tests) | 3 | Logo/name block with fallbacks |
| `components/layout/header.tsx` (modify) | 3 | Fallback title → `OrgIdentity` |
| `lib/pdf/components/pdf-header.tsx`, `lib/pdf/program-document.tsx`, both PDF routes (modify) | 3 | Logo + accent from the record |
| `app/onboarding/client/page.tsx`, `app/p/[slug]/page.tsx`, `app/p/[slug]/success/page.tsx` (modify) | 4 | Client-facing surfaces |
| `lib/email/branding.ts` (+test), `lib/email/templates/layout.tsx` and client-recipient templates (modify) | 4 | Email branding |

---

## Phase 0 — Foundation: canonical `Organization` record

Outcome: no visible change; the org profile is read from the DB; the four page renders and the PDF route stop calling Clerk; `CoachBranding` is gone.

### Task 1: Prisma schema — `Organization` model, drop `CoachBranding`

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `ExerciseSourcePreference` enum and `Organization` model (spec §4.2), consumed by Task 2 and everything after.

- [x] **Step 1: Add the enum and model**

Add `enum ExerciseSourcePreference { BOTH UNIVERSAL ORGANIZATION }` after `enum ExerciseSource` (line ~100). Add the `Organization` model from spec §4.2 verbatim as a new top-level model after `AuditLog`. The `@unique` on `clerkOrgId` is the only index needed — every read is by that key.

- [x] **Step 2: Remove `CoachBranding`**

Delete `model CoachBranding { ... }` (line ~976) and the line `branding CoachBranding? @relation("Branding")` in `model User`.

- [x] **Step 3: Remove the last reference**

In `actions/admin-actions.ts` delete the line `await prisma.coachBranding.deleteMany({ where: { trainerId: userId } });` (line ~149).

- [x] **Step 4: Push and regenerate**

Run: `npx prisma format && npx prisma validate` → `The schema at prisma/schema.prisma is valid`.
Run: `npx prisma db push` → `Your database is now in sync with your Prisma schema.` (Prisma will warn that the `CoachBranding` collection will be dropped; it holds no data.)
Run: `npx prisma generate`.
Run: `npx tsc --noEmit 2>&1 | grep -v "\.next/"` → empty. (`grep -rn "coachBranding\|CoachBranding" --include='*.ts' --include='*.tsx' actions lib app components` must return nothing.)

- [x] **Step 5: Hand off for review**

---

### Task 2: `organization.service.ts`

**Files:**
- Create: `lib/services/organization.service.ts`
- Test: `lib/services/__tests__/organization.service.test.ts`

**Interfaces:**
- Consumes: `prisma.organization`, `clerkClient` (lazy-create only).
- Produces:
  - `ORG_PROFILE_KEYS = ["name","tagline","phone","email","website","address","exerciseSourcePreference"] as const`
  - `getOrganization(clerkOrgId: string): Promise<Organization>` — returns the row, creating it from the Clerk org name if missing (lazy backfill).
  - `getOrganizationOrNull(clerkOrgId: string): Promise<Organization | null>` — no Clerk call, no create (for read paths that must never hit Clerk).
  - `upsertOrganizationProfile(clerkOrgId: string, data: OrganizationProfileInput): Promise<Organization>`
  - `type OrganizationProfileInput = Pick<Organization, typeof ORG_PROFILE_KEYS[number]>` with optional fields except `name`.

- [x] **Step 1: Write the failing tests**

Cover: `getOrganizationOrNull` returns the row / null without calling Clerk; `getOrganization` creates with the Clerk name when missing (mock `clerkClient().organizations.getOrganization`) and does not call Clerk when the row exists; `upsertOrganizationProfile` normalises empty strings to `null`, trims `name`, and validates `exerciseSourcePreference` against the enum (invalid → `BOTH`).

Run: `npx vitest run lib/services/__tests__/organization.service.test.ts` → fails (module missing).

- [x] **Step 2: Implement**

```ts
// lib/services/organization.service.ts
import { prisma } from "@/lib/prisma";
import { clerkClient } from "@clerk/nextjs/server";
import type { Organization, ExerciseSourcePreference } from "@prisma/client";

export const ORG_PROFILE_KEYS = [
  "name", "tagline", "phone", "email", "website", "address", "exerciseSourcePreference",
] as const;

const PREFS: ExerciseSourcePreference[] = ["BOTH", "UNIVERSAL", "ORGANIZATION"];
export function normalizePreference(v: unknown): ExerciseSourcePreference {
  return PREFS.includes(v as ExerciseSourcePreference) ? (v as ExerciseSourcePreference) : "BOTH";
}

export async function getOrganizationOrNull(clerkOrgId: string) {
  return prisma.organization.findUnique({ where: { clerkOrgId } });
}

export async function getOrganization(clerkOrgId: string): Promise<Organization> {
  const existing = await getOrganizationOrNull(clerkOrgId);
  if (existing) return existing;
  // Lazy backfill for orgs that predate the Organization model or were created
  // between deploy and the migration script. One Clerk call, then never again.
  const client = await clerkClient();
  const org = await client.organizations.getOrganization({ organizationId: clerkOrgId });
  return prisma.organization.upsert({
    where: { clerkOrgId },
    update: {},
    create: { clerkOrgId, name: org.name },
  });
}
// upsertOrganizationProfile: trims name, maps "" → null for optional fields,
// normalizePreference(), upsert on clerkOrgId.
```

- [x] **Step 3: Run tests** → pass. `npx tsc --noEmit` clean.

- [x] **Step 4: Hand off for review**

---

### Task 3: Rewrite `organization-actions.ts` on the service; onboarding creates the row

**Files:**
- Modify: `actions/organization-actions.ts`, `actions/__tests__/organization-actions.test.ts`, `actions/onboarding-actions.ts`

**Interfaces:**
- `OrganizationMetadata` and the two exported functions keep their exact names and return shapes (`getOrganizationProfile(): Promise<OrganizationMetadata | null>`, `saveOrganizationProfile(input) → { success, error? }`) so the four page callers and the form need no change. `logoUrl` is removed from `OrganizationMetadata` (it moves to branding in Phase 3); the form's logo field is removed in Task 13.

- [x] **Step 1: Update the tests first**

Replace the Clerk `getOrganization`/`updateOrganization` mocks with a `vi.mock('@/lib/services/organization.service')` exposing `getOrganization`/`upsertOrganizationProfile`, plus a Clerk mock that only exposes `organizations.updateOrganization` (name sync). Assert: reading never calls Clerk; saving calls `upsertOrganizationProfile` then `updateOrganization(orgId, { name })`; a Clerk name-sync failure is logged but does **not** fail the save (DB is canonical); the audit diff keys no longer include `logoUrl`.

- [x] **Step 2: Implement**

`getOrganizationProfile()`: resolve the DB user; `getOrganization(clerkOrgId)`; map to `OrganizationMetadata` (`?? ""` for optional fields, as today).
`saveOrganizationProfile()`: same guards; `before = await getOrganizationOrNull(...)`; `upsertOrganizationProfile`; then `try { updateOrganization(orgId, { name }) } catch { console.error }`; `diffFields(before, after, [...ORG_PROFILE_KEYS])`; `logAudit(CLINIC_SETTINGS_UPDATED)`; `revalidatePath("/settings/clinic")` (the current code revalidates a path that does not exist — fix it while here).

In `actions/onboarding-actions.ts` `completeTrainerOnboarding`, after `createOrganization`, add `await prisma.organization.create({ data: { clerkOrgId: org.id, name: data.organizationName.trim() } })` (inside the same try).

- [x] **Step 3: Run tests** → pass. `grep -rn "publicMetadata" actions/organization-actions.ts` → nothing.

- [x] **Step 4: Hand off for review**

---

### Task 4: `organization.updated` webhook + migration script

**Files:**
- Modify: `app/api/webhooks/clerk/route.ts`, its test in `app/api/webhooks/clerk/__tests__/`
- Create: `lib/db/scripts/migrate-org-profiles-to-db.ts`
- Modify: `package.json` (`"db:migrate-org-profiles": "npx tsx lib/db/scripts/migrate-org-profiles-to-db.ts"`)

- [x] **Step 1: Webhook test then handler**

Add a test: an `organization.updated` event `{ id, name }` calls `prisma.organization.updateMany({ where: { clerkOrgId: id }, data: { name } })` (updateMany so a missing row is a no-op, not an error). Implement the branch next to `organizationMembership.deleted`. Add `organization.updated` to the Clerk dashboard webhook subscription (note for the user in the hand-off).

- [x] **Step 2: Migration script**

Idempotent, prints a summary, never writes to Clerk:

```ts
// pages through client.organizations.getOrganizationList({ limit: 100, offset })
// for each org: meta = org.publicMetadata ?? {}
//   prisma.organization.upsert({
//     where: { clerkOrgId: org.id },
//     update: { name: org.name, tagline, phone, email, website, address,
//               exerciseSourcePreference: normalizePreference(meta.exerciseSourcePreference),
//               ...(isHttpsUrl(meta.logoUrl) ? { brandLogoOnLightUrl: meta.logoUrl } : {}) },
//     create: { ...same, clerkOrgId: org.id },
//   })
// log: `${created} created, ${updated} updated, ${withLogo} carried a logo URL`
```

Note in the script header: carried-over `brandLogoOnLightUrl` values are external URLs (not R2) and will be *ignored* by the renderer's `isOwnAssetUrl` check in Phase 3 (they only keep working in the PDF route until then). Trainers re-upload under Branding.

- [x] **Step 3: Run it against the dev database**

Run: `npm run db:migrate-org-profiles` → summary line. Run twice → second run reports 0 created.

- [x] **Step 4: Hand off for review** — include the dashboard webhook note and the exact command the user must run in production after deploying Phase 0.

---

### Task 5: PDF route reads the DB; parity check

**Files:**
- Modify: `app/api/workout-plans/[id]/pdf/route.ts`

- [x] **Step 1: Replace the Clerk block (lines ~70–86)**

```ts
const org = creator?.clerkOrgId ? await getOrganizationOrNull(creator.clerkOrgId) : null;
const organizationProfile = org
  ? { organizationName: org.name, tagline: org.tagline ?? undefined, logoUrl: org.brandLogoOnLightUrl ?? undefined }
  : {};
```

(Phase 3 replaces `logoUrl` with the resolved branding; this keeps parity now.)

- [x] **Step 2: Verify parity in the browser**

Start the app; as a trainer: `/settings/clinic` loads with the migrated values, saving works and appears in `/settings/audit-log`; `/programs/new` and `/clients/[id]` still respect the exercise-library preference; a workout-plan PDF still shows the org name/tagline. Confirm with server logs that no `api.clerk.com/v1/organizations/<id>` GET happens on those renders.

- [x] **Step 3: `npm run test`** → only the 3 pre-existing failures. **Hand off for review.**

---

## Phase 1 — Theming engine and server-rendered injection

Outcome: a record with `brandingEnabled=true` and a `brandPrimaryColor` (set via Prisma Studio for now) re-themes the whole platform shell for every member of that org, with no flash. Nothing changes for anyone else.

### Task 6: Color math (`lib/branding/color.ts`)

**Files:**
- Modify: `package.json` — `npm i culori` and `npm i -D @types/culori` (skip the latter if `node_modules/culori/package.json` has a `types` field)
- Create: `lib/branding/types.ts`, `lib/branding/defaults.ts`, `lib/branding/color.ts`
- Test: `lib/branding/__tests__/color.test.ts`

**Interfaces (all pure, no server imports — the settings form uses them in the browser):**
- `HEX_RE = /^#[0-9a-f]{6}$/`; `normalizeHex(input: string): string | null` (trims, lower-cases, accepts `#abc` → `#aabbcc`, else null)
- `type Oklch = { l: number; c: number; h: number }` (h defaults to 0 when achromatic)
- `hexToOklch(hex): Oklch` (via `culori.oklch(parse())` + `clampChroma(…, "oklch")`), `oklchToHex(o): string`
- `contrast(a: Oklch, b: Oklch): number` (`wcagContrast`)
- `WHITE`, `NEAR_BLACK(h)`; `pickForeground(bg): { fg: Oklch; kind: "light" | "dark"; ratio: number } | null` (null when neither reaches 4.5)
- `adjustLightnessUntil(color, other, min = 4.5, direction: "darker" | "lighter", step = 0.01, max = 60): { color: Oklch; steps: number }`
- `inGuardrail(o): boolean` (`0.25 ≤ l ≤ 0.80`)
- `fmtOklch(o, alphaPct?): string` → `oklch(0.470 0.190 264.000)` / `oklch(… / 14%)` using `toFixed(3)`; in `defaults.ts`: `DEFAULT_PRIMARY_HEX = "#204ec3"` (nearest hex to `oklch(0.47 0.19 264)` — compute and pin the exact value in the test), `DEFAULT_DISPLAY_NAME = "INMOTUS RX"`.

- [ ] **Step 1: Write the failing tests**

`normalizeHex` cases (`"#ABC"`, `" #204ec3 "`, `"204ec3"` → null, `"#ggg"` → null). `hexToOklch("#ffffff").l ≈ 1`, `"#000000".l ≈ 0`, `"#204ec3"` hue within 255–275. `contrast(black, white) ≈ 21`. `pickForeground` returns `light` for `#1d4ed8`, `dark` for `#fde047`, `null` for `#42808a`-ish mid-tones that fail both. `adjustLightnessUntil` from a failing pastel reaches ≥ 4.5 within 60 steps and returns `steps > 0`; from a passing color returns `steps === 0`. `fmtOklch` output matches `/^oklch\(\d\.\d{3} \d\.\d{3} \d{1,3}\.\d{3}( \/ \d{1,3}%)?\)$/` and never contains `e-` or `NaN` (test with `h = undefined` input).

- [ ] **Step 2: Implement; run tests → pass.** Hand off for review.

---

### Task 7: Token derivation (`lib/branding/tokens.ts`)

**Files:**
- Create: `lib/branding/tokens.ts`
- Modify: `lib/branding/types.ts`
- Test: `lib/branding/__tests__/tokens.test.ts`

**Interfaces:**
- `BRAND_TOKEN_NAMES_LIGHT` / `BRAND_TOKEN_NAMES_DARK` — `as const` tuples exactly matching spec §5.2 (dark omits `ring`, `accent`, `accent-foreground`, `sidebar-border`, `sidebar-ring`).
- `type BrandTokens = { light: Record<LightToken, string>; dark: Record<DarkToken, string>; meta: { inputHex: string; primaryHex: string; adjusted: boolean; adjustedFromHex?: string; primaryForeground: "light" | "dark"; contrastOnPrimary: number } }`
- `deriveBrandTokens(hex: string): BrandTokens` — throws `BrandColorError("out-of-range")` when `!inGuardrail`.

- [ ] **Step 1: Write the failing tests**

1. **Whitelist:** `Object.keys(tokens.light)` equals `BRAND_TOKEN_NAMES_LIGHT` exactly (same for dark) — nothing extra, nothing missing.
2. **Contrast invariants over a grid:** for hue in `0..330 step 30`, l in `[0.3, 0.45, 0.6, 0.75]`, c in `[0.02, 0.12, 0.2]` (clamped), derive and assert: `contrast(primary, primary-foreground) ≥ 4.5`; `contrast(sidebar-primary, sidebar) ≥ 4.5`; `contrast(brand-foreground, brand-soft) ≥ 4.5`; `contrast(accent-foreground, accent) ≥ 4.5`; `contrast(sidebar-foreground(default oklch(0.92 0.01 264)), sidebar) ≥ 4.5`; same for the dark set against its surfaces. Parse each emitted string back with `culori.parse` to compute contrast (so the test exercises the formatter too).
3. **Reproduces the product:** `deriveBrandTokens(DEFAULT_PRIMARY_HEX)` gives `--primary` within ΔL 0.02 / ΔC 0.02 / Δh 3° of `oklch(0.47 0.19 264)`, `--sidebar` near `oklch(0.18 0.04 264)`, `--brand-soft` near `oklch(0.95 0.03 264)`, `--sidebar-primary` near `oklch(0.65 0.15 264)`.
4. **Adjustment reporting:** a pastel like `#337bba` yields `meta.adjusted === true`, `adjustedFromHex === "#337bba"`, and `primaryHex !== inputHex` (`primaryHex === "#3178b6"`); `#1d4ed8` yields `adjusted === false`.
5. **Guardrail:** `#050505` and `#fafafa` throw `BrandColorError`.
6. **Determinism:** two calls with the same input are deeply equal.

- [ ] **Step 2: Implement per spec §5.2–5.3.** Keep each derivation a small named function (`deriveSidebar`, `deriveBrandRole`, …) so the table in the spec maps 1:1 to code. Run tests → pass. Hand off for review.

---

### Task 8: CSS builder and resolver

**Files:**
- Create: `lib/branding/css.ts`, `lib/branding/resolve.ts`
- Modify: `lib/branding/types.ts` (add `ResolvedBranding` from spec §4.4)
- Tests: `lib/branding/__tests__/css.test.ts`, `lib/branding/__tests__/resolve.test.ts`

**Interfaces:**
- `buildBrandCss(tokens: BrandTokens): string` → `:root{--primary:oklch(…);…}:root.dark{…}` (no whitespace, no newlines).
- `BRAND_CSS_RE` — exported so the component test can reuse it: `^:root\{(--[a-z0-9-]+:oklch\(\d\.\d{3} \d\.\d{3} \d{1,3}\.\d{3}( \/ \d{1,3}%)?\);)+\}:root\.dark\{(--[a-z0-9-]+:oklch\(…\);)+\}$`.
- `type BrandingRecord = Pick<Organization, "clerkOrgId" | "name" | "brandingEnabled" | "brandDisplayName" | "brandPrimaryColor" | "brandLogoOnLightUrl" | "brandLogoOnDarkUrl" | "brandMarkUrl" | "brandFaviconUrl" | "brandAppleIconUrl">`; `BRANDING_SELECT` (the Prisma `select` object for it).
- `resolveBranding(record: BrandingRecord | null): ResolvedBranding` — disabled/null → `DEFAULT_BRANDING` (`tokens: null, css: null, displayName: "INMOTUS RX", primaryHex: DEFAULT_PRIMARY_HEX, themeColor: DEFAULT_PRIMARY_HEX`); enabled with a bad/absent color → enabled with default tokens (name/logos still apply); enabled with a valid color → derived tokens + css. A `brandPrimaryColor` that throws `BrandColorError` (a row edited by hand) is treated as absent and `console.warn`ed, never thrown from the read path.
- `isOwnAssetUrl(url: string | null | undefined): url is string` — `startsWith(R2_PUBLIC_URL + "/branding/")`. Lives in `lib/branding/assets.ts` from Task 15; for now put it in `resolve.ts` and move it in Task 15. Non-own URLs resolve to `null` in `ResolvedBranding`.

- [ ] **Step 1: Failing tests**

`css.test.ts`: output matches `BRAND_CSS_RE`; every `--name` in the output is in the whitelist; contains no `<`, `>`, `"`, `'`, `\n`, `/*`, `url(`, `expression(`; an adversarial "token" value cannot get in because the function takes typed `BrandTokens` — assert via a test that mutates a token value to `"red; } body { display:none"` and expects `buildBrandCss` to throw (`assertOklchLiteral` on every value before emitting).
`resolve.test.ts`: null → defaults; `brandingEnabled=false` with everything set → defaults; enabled + `#1d4ed8` → `css` non-null, `displayName` = `brandDisplayName ?? name`; enabled + `"#zzzzzz"` → default tokens, `enabled: true`; an external `https://example.com/logo.png` → `logoOnLightUrl: null`.

- [ ] **Step 2: Implement; tests pass; hand off for review.**

---

### Task 9: `branding.service.ts` with request dedupe and tagged cache

**Files:**
- Create: `lib/services/branding.service.ts`
- Test: `lib/services/__tests__/branding.service.test.ts`

**Interfaces:**
- `brandingTag(clerkOrgId): string` → `org-branding:<id>`
- `getOrgBranding(clerkOrgId: string | null): Promise<ResolvedBranding>` — `React.cache` around a per-org `unstable_cache` (`keyParts: ["org-branding", clerkOrgId]`, `tags: [brandingTag(id)]`, `revalidate: 3600`). `null` → `resolveBranding(null)` without touching the DB.
- `getCurrentBranding(): Promise<ResolvedBranding>` — `React.cache`; `auth()` → `prisma.user.findUnique({ where: { clerkId }, select: { clerkOrgId: true } })` → `getOrgBranding`. Unauthenticated → defaults.
- `expireBranding(clerkOrgId)` — `updateTag(brandingTag(id))`; **called only from Server Actions.**

- [ ] **Step 1: Failing tests**

Mock `next/cache` (`unstable_cache: (fn) => fn`, `updateTag: vi.fn()`), `react` `cache` passthrough, prisma. Assert: `getOrgBranding(null)` never queries; `getOrgBranding("org_1")` queries with `BRANDING_SELECT` and returns the resolved shape; `expireBranding("org_1")` calls `updateTag("org-branding:org_1")`; `getCurrentBranding()` with no `userId` returns defaults without querying.

- [ ] **Step 2: Implement; tests pass; hand off for review.**

Note for the implementer: `unstable_cache` must be created per org id or given the id in `keyParts` — do not create a single cached function that closes over nothing and takes the id as an argument without also listing it in `keyParts`; Next keys on `keyParts` + arguments, so passing the id as an argument is sufficient, but the tag must be per org, which means building the cached function inside a small memoised factory: `const cachedFor = (id) => unstable_cache(load, ["org-branding", id], { tags: [brandingTag(id)], revalidate: 3600 })`.

---

### Task 10: `BrandStyle` + platform layout injection + `--sidebar-gradient-end`

**Files:**
- Create: `components/branding/brand-style.tsx`, `components/branding/__tests__/brand-style.test.tsx`
- Modify: `app/(platform)/layout.tsx`, `app/globals.css`, `components/layout/sidebar.tsx`

- [ ] **Step 1: Failing component test**

`renderToStaticMarkup(<BrandStyle branding={resolveBranding(null)} />)` → `""`. With an enabled record → contains `<style id="org-brand">` whose inner text matches `BRAND_CSS_RE`.

- [ ] **Step 2: Implement `BrandStyle`**

```tsx
// components/branding/brand-style.tsx  (no "use client"; pure)
import type { ResolvedBranding } from "@/lib/branding/types";
export function BrandStyle({ branding }: { branding: ResolvedBranding }) {
  if (!branding.css) return null;
  // The only dangerouslySetInnerHTML in the branding feature. `css` is produced
  // by buildBrandCss() from numeric oklch values and is grammar-checked in
  // lib/branding/__tests__/css.test.ts; no user string can reach it.
  return <style id="org-brand" dangerouslySetInnerHTML={{ __html: branding.css }} />;
}
```

- [ ] **Step 3: Token for the sidebar gradient**

`app/globals.css`: add `--sidebar-gradient-end: oklch(0.15 0.04 264);` to `:root` and `--sidebar-gradient-end: oklch(0.12 0.03 264);` to `.dark` (next to the other `--sidebar-*` lines; no `@theme inline` entry needed — it is only used in `var()`).
`components/layout/sidebar.tsx`: `background: "linear-gradient(180deg, var(--sidebar), var(--sidebar-gradient-end))"`.

- [ ] **Step 4: Layout injection and metadata**

In `app/(platform)/layout.tsx`: `const branding = await getCurrentBranding();` (add to the existing `Promise.all`), render `<BrandStyle branding={branding} />` as the first child inside `<div data-app-shell …>`. Add:

```ts
export async function generateMetadata(): Promise<Metadata> {
  const b = await getCurrentBranding();          // deduped with the layout's call
  return { title: { template: `%s | ${b.displayName}`, default: b.displayName } };
}
export async function generateViewport(): Promise<Viewport> {
  const b = await getCurrentBranding();
  return { themeColor: b.themeColor };
}
```

(`icons` are added in Task 19 once assets exist.) Check that `app/layout.tsx`'s root `title.template` still applies to non-platform routes — nested layout metadata overrides only the keys it sets.

- [ ] **Step 5: Manual verification (the acceptance test for Phase 1)**

`npx prisma studio` → set an `Organization` row to `brandingEnabled: true`, `brandPrimaryColor: "#0f766e"` (teal). As a trainer *and* as a client of that org: dashboard first paint is teal (view-source shows `<style id="org-brand">` in the HTML; no indigo flash on hard reload); buttons, active nav, focus rings, `StatusBadge role="brand"`, `UserButton` popover are teal-family; sidebar is a dark teal-tinted navy; destructive/success/warning badges unchanged; `/admin` and `/` unchanged; a dialog and a toast (portals) are teal. Flip `brandingEnabled: false` → back to indigo on next navigation. Record the result in the hand-off.

- [ ] **Step 6: `npm run test`, `tsc`, `npm run lint:palette`** → clean. **Hand off for review.**

---

## Phase 2 — Settings page (name, color, switch, preview, reset)

Outcome: trainers can brand their org without touching the database. Logos come in Phase 3.

### Task 11: Validators and audit actions

**Files:**
- Create: `lib/validators/branding.ts`, `lib/validators/__tests__/branding.test.ts`
- Modify: `lib/services/audit-log.service.ts`, `components/audit-log/audit-log-table.tsx`

**Interfaces:**
- `hexColorSchema` — `z.string().trim().refine(v => normalizeHex(v) !== null, "Enter a color like #1d4ed8").transform(v => normalizeHex(v)!)` (accepts `#abc`/`#ABCDEF`, always outputs lower-case `#rrggbb`).
- `displayNameSchema = z.string().trim().min(1).max(60).regex(/^[^\p{Cc}]+$/u, "No control characters")`
- `brandingSettingsSchema = z.object({ brandingEnabled: z.boolean(), brandDisplayName: displayNameSchema.nullable(), brandPrimaryColor: hexColorSchema.nullable() })`
- `assetKindSchema = z.enum(["logo-on-light", "logo-on-dark", "mark"])` (used from Task 15)
- `AUDIT_ACTIONS.BRANDING_UPDATED`, `AUDIT_ACTIONS.BRANDING_RESET`; labels "Updated branding", "Reset branding to defaults".

- [ ] **Step 1: Tests** — valid/invalid hex forms, name length/control chars, `null`s accepted, unknown keys stripped.
- [ ] **Step 2: Implement; tests pass; hand off for review.**

---

### Task 12: `branding-actions.ts` — get / save / reset

**Files:**
- Create: `actions/branding-actions.ts`, `actions/__tests__/branding-actions.test.ts`

**Interfaces:**
- `type BrandingSettings = { brandingEnabled: boolean; brandDisplayName: string | null; brandPrimaryColor: string | null; orgName: string; assets: { logoOnLightUrl; logoOnDarkUrl; markUrl } }`
- `getBrandingSettings(): Promise<BrandingSettings | null>` (null when no org)
- `saveBrandingSettings(input: unknown): Promise<{ success: true } | { success: false; error: string; field?: string }>`
- `resetBranding(): Promise<{ success: true } | { success: false; error: string }>`

Shared guard `requireTrainerOrg()` (private): `auth()` → DB user → `role === "TRAINER"` and `clerkOrgId` present, else `{ success: false, error: "Unauthorized" | "Forbidden" | "Organization not set up" }`.

- [ ] **Step 1: Failing tests**

Save: CLIENT → Forbidden; no org → error; invalid hex → `{ field: "brandPrimaryColor" }`; out-of-guardrail color (`#fafafa`) → error mentioning "near-white" (run `deriveBrandTokens` inside a try in the action — the zod schema is syntactic, the guardrail is semantic); happy path → `prisma.organization.update` with normalised values, `expireBranding("org_1")` called, `logAudit` called with `BRANDING_UPDATED` and a `diffFields` metadata over the three fields, `revalidatePath("/settings/branding")`. Reset: clears the three fields plus all `brand*Url` fields, calls `deleteBrandAssets(orgId)` (stub from `lib/branding/assets.ts`; Task 15 implements it — for now export a no-op with a TODO), audits `BRANDING_RESET`.

- [ ] **Step 2: Implement; tests pass; hand off for review.**

---

### Task 13: Settings UI, nav entry, copy fixes

**Files:**
- Create: `components/settings/color-field.tsx`, `components/settings/brand-preview.tsx`, `components/settings/branding-form.tsx`, `app/(platform)/settings/branding/page.tsx`
- Modify: `components/layout/sidebar.tsx` (nav + `accountHrefs`), `app/(platform)/settings/clinic/page.tsx` (description → "Your organization's profile and contact details"; add a `secondaryActions` link "Branding"), `components/settings/organization-profile-form.tsx` (remove the logo field and `logoUrl` state; `next/image` import goes with it), `app/page.tsx` (pricing bullet per spec §12.1 default: add "Custom organization branding" to every tier's feature list, remove the "Practice"-only placement)
- Tests: `components/settings/__tests__/brand-preview.test.tsx`

**Components:**
- `ColorField` (`"use client"`): props `{ value: string | null; onChange(hex: string | null): void; error?: string }`. Native `<input type="color">` and a text `Input` kept in sync; shows the swatch. Uses `normalizeHex` on blur.
- `BrandPreview` (`"use client"`): props `{ hex: string | null; displayName: string }`. Calls `deriveBrandTokens` in a `useMemo` inside a `try`; renders a bordered panel whose root `style` sets every light token as a CSS custom property (`{"--primary": …}`) so the demo below is themed *locally*; contents: mini sidebar strip (`bg-sidebar`) with one active row (`bg-sidebar-primary/15 text-sidebar-primary`), a default `Button`, an outline `Button`, `StatusBadge role="brand"`, a `bg-brand-soft text-brand-foreground border-brand-border` callout, a `text-primary` link. Under it, the contrast readout: ratio + "AA" pass, the amber `adjusted` notice with both hexes, or the guardrail error. A second panel for dark tokens is rendered only when a theme toggle exists (leave a comment; skip for now).
- `BrandingForm` (`"use client"`): props `{ initial: BrandingSettings }`. `Switch` for `brandingEnabled`; `Input` for display name (placeholder = `orgName`); `ColorField`; `BrandPreview`; Save (disabled until dirty) → `saveBrandingSettings` → `toast` + `router.refresh()`; Reset → `ConfirmDialog` → `resetBranding`. Placeholder `FormSection title="Logos"` with a muted note "Logo upload arrives in the next release" — replaced in Task 18.
- Page: `requireRole("TRAINER")`; empty state when `!trainer.clerkOrgId` (copy the audit-log page pattern); `PageShell width="narrow"`, `PageHeader title="Branding" description="Your organization's look across the app, PDFs and emails your clients receive."`, `back` to `/settings`.

- [ ] **Step 1: `BrandPreview` test** — renders `style="--primary:oklch(…)"` for a valid hex; renders the guardrail message for `#fafafa`; renders nothing color-specific for `null`.
- [ ] **Step 2: Implement the components and page.** Sidebar: add `navItem("/settings/branding", "Branding", Palette)` between Organization and Audit Log and add the href to `accountHrefs`.
- [ ] **Step 3: Copy** — clinic page and marketing bullet as listed above.
- [ ] **Step 4: `tsc`, tests, `lint:palette`** clean. **Hand off for review.**

---

### Task 14: Browser verification — Phase 2

- [ ] As a trainer: open `/settings/branding`; the preview updates as you drag the color; pick `#337bba` → amber "darkened" notice with the ratio (→ `#3178b6`); pick `#fafafa` → blocking error and Save disabled; pick `#0f766e`, set display name "Summit PT", enable, Save → toast; page refreshes teal; header fallback title / `<title>` reads "… | Summit PT"; `/settings/audit-log` shows "Updated branding" with the diff; Reset → confirm → indigo again and "Reset branding to defaults" logged.
- [ ] As a client of that org (branding enabled again): every screen is teal; `/settings` (UserProfile) primary buttons teal; nothing on `/` or `/sign-in` changed.
- [ ] Phone width (375 px): the settings page has no horizontal scroll; the preview stacks.
- [ ] Record results. **Hand off for review.**

---

## Phase 3 — Logos and assets

Outcome: logos in the sidebar/header, favicon and apple icon, PDFs; upload from the settings page.

### Task 15: `lib/branding/assets.ts` — kinds, keys, sharp processing

**Files:**
- Modify: `package.json` — `npm i sharp` (make the transitive dependency explicit; pin to the version already in the lockfile)
- Create: `lib/branding/assets.ts`, `lib/branding/__tests__/assets.test.ts`
- Modify: `lib/branding/resolve.ts` (import `isOwnAssetUrl` from here)

**Interfaces:**
- `ASSET_KINDS = ["logo-on-light", "logo-on-dark", "mark"] as const`; `type AssetKind`
- `MAX_ASSET_BYTES = 2 * 1024 * 1024`; `ACCEPTED_MIME = ["image/png","image/jpeg","image/webp"]`
- `ASSET_LIMITS: Record<AssetKind, { minWidth; minHeight; maxDim: 4096 }>` (logos ≥ 64 tall; mark ≥ 128 both)
- `processBrandAsset(input: Buffer, kind): Promise<{ primary: Buffer; derivatives: Array<{ suffix: "favicon-32" | "apple-180"; buffer: Buffer }> }>` — `sharp(input, { limitInputPixels: 4096 * 4096 }).rotate()`; `metadata()` → throw `AssetError("format")` if `format ∉ {png,jpeg,webp}`, `AssetError("dimensions")` if outside limits; logos: `.resize({ height: 256, width: 1024, fit: "inside", withoutEnlargement: true }).png()`; mark: `.resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png()` plus 32 and 180 px derivatives.
- `pendingKey(orgId, kind, uuid)` → `branding/<org>/pending/<uuid>-<kind>.png`; `PENDING_KEY_RE(orgId, kind)`; `finalKey(orgId, kind, sha8)`; `derivativeKey(...)`.
- `isOwnAssetUrl(url)`; `assetUrl(key)` → `${R2_PUBLIC_URL}/${key}`.
- `deleteBrandAssets(orgId)` — best-effort `ListObjectsV2` on `branding/<org>/` + `DeleteObjects`; never throws.
- `fieldForKind: Record<AssetKind, keyof Organization>` (`brandLogoOnLightUrl` …).

- [ ] **Step 1: Failing tests** — generate a real 300×100 PNG and a 200×200 JPEG with `sharp` in the test; assert logos come back PNG ≤ 256 tall; mark returns 512×512 PNG with alpha + two derivatives of the right size; a 40×40 mark throws `dimensions`; an SVG string buffer throws `format` (sharp reports `svg`); a 5000×10 image throws `dimensions`; a text buffer throws (any error) and never returns; key regex accepts the caller's org and rejects another org's id and path traversal (`../`).
- [ ] **Step 2: Implement; tests pass; hand off for review.**

---

### Task 16: Upload route `POST /api/branding/assets`

**Files:**
- Create: `app/api/branding/assets/route.ts`, `app/api/branding/assets/__tests__/route.test.ts`

- [ ] **Step 1: Failing tests** (call `POST` directly with a constructed `Request` carrying `FormData`; mock Clerk `auth`, prisma user, `getR2Client` with a `send: vi.fn()`)

401 without user; 403 for CLIENT or no org; 413 when the file exceeds 2 MB (check `file.size` before reading); 415 for `image/svg+xml`; 422 when sharp rejects; 200 with `{ pendingKeys: { primary, derivatives: [...] }, previewUrl }` for a valid PNG, and every key starts with `branding/<callerOrg>/pending/`; the `PutObjectCommand` inputs carry `ContentType: "image/png"` and `CacheControl: "public, max-age=31536000, immutable"`.

- [ ] **Step 2: Implement.** `export const runtime = "nodejs"`. `const form = await request.formData(); const kind = assetKindSchema.parse(form.get("kind")); const file = form.get("file"); if (!(file instanceof File)) 400`. Never log file contents. **Add the route to nothing in `proxy.ts`** — it must stay protected (authenticated) — but do add a test that asserts it is *not* matched by `isPublicRoute` (the email-notifications retro found this class of gap invisible to handler tests).

- [ ] **Step 3: Tests pass; hand off for review.** Include an ops note: add an R2 lifecycle rule expiring `branding/*/pending/` after 1 day.

---

### Task 17: `confirmBrandAsset` / `removeBrandAsset` actions

**Files:**
- Modify: `actions/branding-actions.ts`, `actions/__tests__/branding-actions.test.ts`

**Interfaces:**
- `confirmBrandAsset(input: { kind: AssetKind; pendingKey: string; derivativeKeys?: string[] }): Promise<{ success: true; url: string } | { success: false; error }>` — guard; validate keys with `PENDING_KEY_RE(callerOrg, kind)`; `HeadObject` the pending key (must exist, `ContentLength ≤ MAX`); compute `sha8` from `ETag` (or a fresh `GetObject` hash — ETag is fine for single-part uploads); `CopyObject` to `finalKey`, derivatives likewise (`favicon-32`, `apple-180`); `DeleteObject` pending keys; read the current record; `update` the kind's field (+ `brandFaviconUrl`/`brandAppleIconUrl` for mark), `brandUpdatedAt/ById`; best-effort delete previous final objects for that kind; `expireBranding`; `logAudit(BRANDING_UPDATED, { assets: [kind] })`; `revalidatePath("/settings/branding")`.
- `removeBrandAsset({ kind })` — clears the field(s), best-effort deletes objects, audit with `{ assets: [kind], removed: true }`, expire.
- Replace the Task 12 no-op `deleteBrandAssets` call in `resetBranding` with the real one.

- [ ] **Step 1: Failing tests** — another org's pending key → error and no R2 calls; missing object → error; happy path issues Copy → Delete → `update` in that order (use `mockSend.mock.calls` command constructors), expires the tag, audits `{ assets: ["mark"] }` and never includes URLs in metadata.
- [ ] **Step 2: Implement; tests pass; hand off for review.**

---

### Task 18: Upload hook + `LogoUploader` + form integration

**Files:**
- Create: `hooks/use-brand-asset-upload.ts`, `components/settings/logo-uploader.tsx`
- Modify: `components/settings/branding-form.tsx`

- [ ] **Step 1: Hook** — mirrors `useVoiceMemoUpload`: `upload(kind, file)` → client-side pre-checks (`file.size ≤ MAX_ASSET_BYTES`, `ACCEPTED_MIME`) → `fetch("/api/branding/assets", { method: "POST", body: formData })` → `confirmBrandAsset(...)` → returns `{ url }`; states `idle/uploading/confirming/done/error`.
- [ ] **Step 2: `LogoUploader`** (`"use client"`): props `{ kind; label; hint; surface: "light" | "dark"; currentUrl: string | null }`. Shows the current image (fixed `h-16` box, `object-contain`, on `bg-card` or `bg-sidebar` per surface), a file input (`accept="image/png,image/jpeg,image/webp"`), drag-and-drop onto the box, Replace/Remove buttons, progress and error text (`text-danger-foreground`). Calls `router.refresh()` after confirm/remove so the shell updates.
- [ ] **Step 3: Replace the placeholder "Logos" section** in `BrandingForm` with three uploaders (logo on light, logo on dark, square mark) and a one-line explanation of the fallbacks from spec §6.1.
- [ ] **Step 4: `tsc`, `lint:palette`. Hand off for review.**

---

### Task 19: `OrgIdentity` in sidebar/header; favicon and apple icon metadata

**Files:**
- Create: `components/branding/org-mark.tsx`, `components/branding/org-identity.tsx`, `components/branding/__tests__/org-identity.test.tsx`
- Modify: `components/layout/sidebar.tsx`, `components/layout/header.tsx`, `app/(platform)/layout.tsx`
- Modify: `lib/branding/types.ts` — add `BrandingViewModel = Pick<ResolvedBranding, "enabled" | "displayName" | "primaryHex" | "logoOnLightUrl" | "logoOnDarkUrl" | "markUrl">` (serialisable subset to pass into client components) and `toViewModel(b)`.

**Components:**
- `OrgMark({ branding, size })` — `<img>` of `markUrl` when present, else a rounded tile with the first letter of `displayName` on `bg-primary text-primary-foreground` (branded automatically).
- `OrgIdentity({ branding, surface, subtitle })` — implements the fallback table (spec §6.1): dark surface → `logoOnDarkUrl` ‖ `logoOnLightUrl` on a `bg-card rounded-md px-1.5 py-1` plate ‖ `OrgMark` + name; light surface → `logoOnLightUrl` ‖ `OrgMark` + name. Fixed `h-8` image box with explicit `width`/`height`; `alt={displayName}`; `unoptimized` `next/image` or plain `<img>` (either is acceptable — pick one and use it for all three). Falls back to the existing `Activity` icon + "INMOTUS RX" when `!branding.enabled`.
- `Sidebar` gains `branding: BrandingViewModel` and renders `<OrgIdentity surface="dark" subtitle={role === "TRAINER" ? "Trainer Portal" : "Client Portal"} />` in the top block; the user-section footer shows "Powered by INMOTUS RX" (`text-[10px] text-sidebar-foreground/40`) when `branding.enabled && role === "CLIENT"` (spec §12.3 default).
- `Header` gains `branding` and passes it to the mobile `Sidebar`; its fallback title span becomes `branding.displayName`.
- Layout: `const vm = toViewModel(branding)` passed to both. `generateMetadata` adds `icons: b.faviconUrl ? { icon: [{ url: b.faviconUrl, sizes: "32x32", type: "image/png" }], apple: b.appleIconUrl ? [{ url: b.appleIconUrl, sizes: "180x180" }] : undefined } : undefined`.

- [ ] **Step 1: `OrgIdentity` tests** — six fallback cases render the expected element (`img` with the right `src`, plate class present, initials text, product default).
- [ ] **Step 2: Implement; tests pass.**
- [ ] **Step 3: Browser** — upload a wide light logo, a white-on-transparent dark logo and a square mark; sidebar shows the dark logo; remove it → light logo on a plate; remove that → mark + name; tab favicon changes; `/admin` still shows the product mark. No layout jump while images load (Network throttled). **Hand off for review.**

---

### Task 20: PDFs — both routes read the branding record

**Files:**
- Modify: `app/api/workout-plans/[id]/pdf/route.ts`, `app/api/programs/[id]/pdf/route.ts`, `lib/pdf/components/pdf-header.tsx`, `lib/pdf/program-document.tsx`, `lib/pdf/hep-document.tsx`
- Test: extend `lib/pdf/__tests__/`

- [ ] **Step 1:** Replace the Task 5 block in the workout-plan route with `const b = await getOrgBranding(creator?.clerkOrgId ?? null)`; `organizationProfile = { organizationName: b.displayName, tagline: org?.tagline, logoUrl: b.logoOnLightUrl }` (keep `getOrganizationOrNull` for `tagline`, or add tagline to `BRANDING_SELECT` — prefer the latter and expose `tagline` on `ResolvedBranding`). Logo fetch stays (5 s timeout) — it is now guaranteed PNG from our bucket. Add `accentHex: b.primaryHex` to `HEPDocument`/`PdfHeader` props and use it for `organizationName` color.
- [ ] **Step 2:** Programs route: resolve `program.trainer.clerkOrgId` (add to the `include`/`select`) → `getOrgBranding` → pass `organizationName: b.displayName`, `logoBuffer`, `accentHex` into `ProgramDocument`; render the logo (≤ 48 pt tall) above the title when present; title color = accent.
- [ ] **Step 3:** Tests: `ProgramDocument`/`HEPDocument` render with and without a logo buffer (use `renderToBuffer` smoke test if one exists in `lib/pdf/__tests__`, else assert props plumb through). Browser: download both PDFs as a trainer and as a client; logo and name present; no logo → header still aligned.
- [ ] **Hand off for review.**

---

### Task 21: Browser verification — Phase 3

- [ ] Trainer and client on desktop and 375 px; upload/replace/remove every kind; oversize (3 MB) and SVG rejected with readable errors; favicon; PDFs; `/p/[slug]` still product-styled (Phase 4).
- [ ] `npm run test`, `tsc`, `lint:palette` clean. Record results. **Hand off for review.**

---

## Phase 4 — Client-facing reach

### Task 22: Client onboarding page

**Files:**
- Modify: `app/onboarding/client/page.tsx`

- [ ] `const { orgId } = await auth()` is already available (`getCurrentUser` logic) → `const b = await getOrgBranding(orgId ?? null)`; render `<BrandStyle branding={b} />` at the top of the page; replace both "INMOTUS RX" identity blocks with `<OrgIdentity surface="dark">` (left panel) and `surface="light"` (mobile); copyright line → `b.displayName`; copy "so your trainer can personalize" → "so {displayName} can personalize" only when enabled. Also replace the raw hex gradient `from-[#0f172a] via-[#1e3a5f] to-[#0c4a6e]` with `from-sidebar via-sidebar-accent to-sidebar-gradient-end`-equivalent classes (`bg-sidebar` + the same inline gradient as the sidebar) so the panel follows the brand. Verify as a freshly invited client. **Hand off for review.**

---

### Task 23: Sales page and success page

**Files:**
- Modify: `app/p/[slug]/page.tsx`, `app/p/[slug]/success/page.tsx`, `lib/services/sellable-package.service.ts` (include the seller's `clerkOrgId`)

- [ ] `getSellablePackageBySlug` returns `trainer: { clerkOrgId }`; both pages `getOrgBranding(pkg.trainer.clerkOrgId)`, render `<BrandStyle>`, an `<OrgIdentity surface="light">` above the package name, and set `generateMetadata` title `${pkg.name} | ${b.displayName}`. The pages are public and cached per request only (dynamic already). Verify with the existing test-mode package. **Hand off for review.**

---

### Task 24: Client-recipient emails

**Pre-condition:** `lib/email/templates/layout.tsx` (`EmailLayout`) and `lib/email/send.ts` exist on this branch and `@react-email/render` is installed. If not, stop and report.

**Files:**
- Create: `lib/email/branding.ts`, `lib/email/__tests__/branding.test.ts`
- Modify: `lib/email/templates/layout.tsx` (add `logoUrl?: string` → `<img>` in the header bar, `height="32"`, `alt={organizationName}`, with the name as text when absent), `lib/email/send.ts` (accept `fromName?: string`, `replyTo?: string`), the dispatcher (`notifyUser` / registry call sites) for **client-recipient** types only, `lib/email/send-program-welcome.ts`, the share-program send in `actions/program-actions.ts`.

**Interfaces:**
- `getEmailBranding(clerkOrgId: string | null): Promise<{ organizationName: string; accent: string; logoUrl?: string; fromName: string; replyTo?: string }>` — from `getOrgBranding` (+ `Organization.email` for `replyTo`); disabled → `{ "INMOTUS RX", "#2563eb", fromName: "INMOTUS RX" }`. `accent` is `primaryHex` (hex, because email clients do not support oklch).

- [ ] **Step 1: Tests** — defaults when disabled; branded values when enabled; `EmailLayout` renders the `<img>` only with `logoUrl`; `sendEmail` puts `fromName` into `from: "Summit PT <noreply@…>"` and passes `replyTo`.
- [ ] **Step 2: Wire** every email whose recipient is a client (session reminder, program welcome, share program, new message from trainer, exercise-note/feedback responses, check-in assigned, nutrition comment/nudge) to spread `await getEmailBranding(recipient.clerkOrgId)` into `EmailLayout` props and `sendEmail`. Trainer-recipient and billing emails are untouched.
- [ ] **Step 3: `render-path.test.ts`-style smoke** through the real Resend render path for one branded template. Send one real email with `EMAIL_REDIRECT_TO` set. **Hand off for review.**

---

### Task 25: Final verification and hand-off

- [ ] Full checklist as trainer + client: shell, portals, settings flow, uploads, favicon/title, PDFs, onboarding, sales page, emails; reset returns everything to product defaults; `/admin`, `/`, `/sign-in` unchanged.
- [ ] `npm run test` (only the 3 baseline failures), `npx tsc --noEmit` clean, `npm run lint:palette` clean, `npm run build` clean.
- [ ] Hand-off notes for the user: run `npm run db:migrate-org-profiles` in production after deploying Phase 0; subscribe the Clerk webhook to `organization.updated`; add the R2 lifecycle rule for `branding/*/pending/`; the `UPLOADTHING_TOKEN` env var can be deleted.
