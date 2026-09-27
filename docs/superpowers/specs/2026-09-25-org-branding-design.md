# Per-Organization Branding (White-Label Theming) Design

**Date:** 2026-09-25
**Status:** Decisions resolved — all §12 defaults accepted 2026-09-25; implemented on branch `org-branding`.
**Scope:** Let an organization (a trainer's Clerk org) set a display name, logo set and primary brand color, and have that identity applied across the trainer and client apps, PDF exports and client-facing emails. Replaces the Clerk-`publicMetadata` org profile and the dead `CoachBranding` model with one DB-backed `Organization` record.

---

## 1. Overview

Today "branding" is a name and a pasted logo URL stored in the Clerk organization's `publicMetadata`, used only in one PDF export. The marketing page promises "Custom organization branding". The app's visual identity (indigo primary, navy sidebar, "INMOTUS RX" wordmark) is hard-coded in about a dozen places.

This design adds a real branding feature:

- **One canonical record** — a new `Organization` Prisma model keyed by `clerkOrgId` holds the org profile (migrated out of Clerk metadata) *and* the branding fields. Clerk keeps only the org `name` as identity authority and is kept in sync.
- **A theming engine** — a pure module turns one validated hex color into the full set of brand-related design tokens (light and dark), with WCAG-AA-safe foregrounds and guardrails, and emits a strictly-formatted CSS block that the platform layout injects server-side. Everything that already uses `bg-primary`, `text-sidebar-primary`, `brand-soft`, etc. is branded for free; neutral, destructive and status tokens are never overridable.
- **A logo pipeline** — validated, re-encoded PNG uploads to Cloudflare R2 (the repo's existing store) with light-surface, dark-surface and square-mark variants, favicon derivatives, and graceful fallbacks.
- **A settings page** at `/settings/branding` with live preview, contrast feedback, reset, and audit logging.
- **Client-facing reach** — clients see their coach's brand in the app shell, document title/favicon, client onboarding, PDFs and the emails they receive. Trainers see their own brand in the app; their vendor relationship (billing, emails *to* trainers) stays INMOTUS RX.

Shipped in five independently useful phases (§11). Custom domains, custom fonts, SVG logos, per-tenant mobile binaries and branded sign-in are explicitly out of scope (§10).

---

## 2. Current state (verified 2026-09-25)

| Area | What exists | Consequence for this design |
|---|---|---|
| Org membership | `completeTrainerOnboarding` creates a Clerk org per trainer; clients join by invitation and get `User.clerkOrgId`. All trainer lookups use `findFirst({ clerkOrgId, role: "TRAINER" })`; no Clerk org roles are read anywhere. | An org of one *is* the solo-trainer case. Branding is keyed by `clerkOrgId`; no separate per-trainer scope. Any `TRAINER` in the org may edit (§7.4). |
| Org profile | `actions/organization-actions.ts` reads/writes Clerk `publicMetadata` (tagline, logoUrl, phone, email, website, address, exerciseSourcePreference). `getOrganizationProfile()` — a Clerk API round trip — is called from `clients/[id]`, `programs/new`, `programs/[id]/edit`, `programs/upload` and the workout-plan PDF route. | Per-request theming cannot depend on the Clerk API (latency, rate limits). The profile moves to the DB (§4). This reverses the 2026-05-31 decision to keep extra metadata in Clerk; the reason that decision no longer holds is the read frequency. |
| `CoachBranding` model | `prisma/schema.prisma:976`, per-trainer, only referenced by the user-delete cleanup in `actions/admin-actions.ts:149`. | Dropped, not repurposed: wrong scope (trainer, not org), wrong fields (`customDomain`, `fontFamily`), no data. |
| Design tokens | `app/globals.css`: shadcn-style oklch tokens on `:root` and `.dark`, exposed via `@theme inline`; semantic status roles `info/success/warning/danger/neutral/brand`; sidebar token family; `--chart-2` = primary. `lib/ui/clerk-appearance.ts` maps Clerk UI to `var(--primary)` etc. | The override surface is a small whitelist of token names (§5.2). Clerk's embedded UI follows automatically. |
| Dark mode | `.dark` tokens exist; no `ThemeProvider`, toggle or `prefers-color-scheme` hook. `components/ui/sonner.tsx` calls `useTheme()` with no provider. | Dark variants are generated and emitted (cheap, future-proof) but a toggle is not part of this feature. |
| Lint | `eslint-rules/no-raw-palette.mjs` bans raw palette classes in `app/**` and `components/**` (except `components/ui/**`, marketing, emails, tests). Arbitrary values like `bg-[oklch(...)]` are not banned. | New UI uses semantic tokens; the preview panel uses inline CSS variables. |
| Shell | `app/(platform)/layout.tsx` (server) renders `Sidebar` + `Header`; both hard-code "INMOTUS RX". `sidebar.tsx:127` hard-codes a gradient end `oklch(0.15 0.04 264)`. Admin shell (`app/admin/layout.tsx`) is separate. | The platform layout is the single injection point. Admin shell is never branded. |
| Storage | Cloudflare R2 via `lib/r2.ts` (`@aws-sdk/client-s3`), presigned PUT + `pending/` key + confirm-and-copy pattern (`actions/voice-memo-actions.ts`, `hooks/use-voice-memo-upload.ts`). `UPLOADTHING_TOKEN` is in `.env` but no uploadthing package is installed — that is why the form says "Logo upload is temporarily unavailable". `sharp` is present only as a transitive dependency of Next. | Logos go to R2. Because logo bytes must be validated and re-encoded server-side, upload goes through a Route Handler (not a presigned PUT, not a Server Action — the latter has a 1 MB default body limit). `sharp` becomes an explicit dependency. |
| PDFs | `app/api/workout-plans/[id]/pdf/route.ts` fetches Clerk metadata and the logo URL (assumes PNG: `format: "png"`); `app/api/programs/[id]/pdf/route.ts` hard-codes `organizationName: 'INMOTUS RX'` and has no logo. `@react-pdf/renderer` supports PNG/JPEG only. | Stored logos are always PNG. Both routes read the DB record. |
| Emails | This branch: six templates with hard-coded "INMOTUS RX" and a red `#dc2626` accent, sent inline via `getResend().emails.send`. The unmerged `email-notifications` branch (3 ahead / 3 behind `doc-changes`) adds `lib/email/templates/layout.tsx` (`EmailLayout` with `organizationName` and `accent` props) and `lib/email/send.ts`. `@react-email/render` is missing on this branch, so every `react:` send fails at runtime today (known, pre-existing). | Email branding (Phase 4) targets `EmailLayout`. **Update 2026-09-25:** `email-notifications` is now merged into this branch, so the dependency is met. |
| Audit log | `lib/services/audit-log.service.ts` with `AUDIT_ACTIONS.CLINIC_SETTINGS_UPDATED`; labels in `components/audit-log/audit-log-table.tsx`; trainer view at `/settings/audit-log`. | Add `BRANDING_UPDATED` and `BRANDING_RESET`. |
| Caching | No `unstable_cache`/`cacheTag`/`revalidateTag` usage anywhere. Next 16.1.6: `unstable_cache` available; `revalidateTag(tag, profile)` requires a profile; `updateTag(tag)` exists for Server Actions. `cacheComponents` is not enabled. | §5.5. |
| Billing | Tiers `STARTER/PRO/UNLIMITED` in `lib/stripe-config.ts`, client-count only; no feature gating exists. Marketing page lists "Custom organization branding" under a "Practice $149" tier that does not exist in `TIER_CONFIG`. | Open question §12.1. |
| Mobile | `mobile-app-capacitor` branch: a remote-webview shell loading the web app. | Web branding flows through automatically. App icon, splash and store listing remain INMOTUS RX (one binary). `theme-color` is emitted for the status bar. |
| Self-serve funnel | `/p/[slug]` public sales page belongs to the selling trainer's org; currently product-styled. | Branded in Phase 4 (cheap: the same `BrandStyle` component). |
| Tests | Vitest, `environment: 'node'`, `globals: true`; `vi.mock('@/lib/prisma', ...)` convention; component tests with `renderToStaticMarkup`; tests live in `__tests__/` beside the code. | §9. |

---

## 3. Goals and non-goals

**Goals**

1. A trainer can set a display name, a primary color and logos once, and every surface a client sees (app shell, title/favicon, onboarding, PDFs, client emails, sales page) reflects it.
2. Impossible to produce an unreadable UI: every derived text/background pair meets WCAG AA (4.5:1) by construction, and the picker tells the trainer when their color was adjusted.
3. Impossible to inject CSS or scripts: user input never reaches CSS or HTML unescaped; only numeric oklch values built by our code are emitted; logos are re-encoded PNGs served from our bucket.
4. No flash of unbranded content and no layout shift: tokens are in the server-rendered HTML; logo boxes have fixed dimensions.
5. One DB read per request (deduped, cached, invalidated on save); zero Clerk API calls on the read path.
6. Reversible: "Use custom branding" off, or "Reset to defaults", returns the org to the product look instantly.

**Non-goals** (see §10): custom domains, custom fonts, SVG logos, per-tenant sign-in pages, per-tenant mobile binaries, a dark-mode toggle, super-admin editing of another org's brand, removing INMOTUS RX from the trainer's billing/vendor surfaces.

---

## 4. Source of truth and data model

### 4.1 Decision: one `Organization` model in MongoDB, keyed by `clerkOrgId`

- **Single canonical record** for both the org profile (today in Clerk metadata) and branding. One upsert path, one service, one audit target, one cache entry. The whole document is under 1 KB; the branding read path uses a `select` so it pays only for what it needs.
- **Keyed by `clerkOrgId`**, not by a trainer id, because clients, audit entries and exercises are already scoped by `clerkOrgId`, and because a second trainer in the same org must see the same brand.
- **Clerk stays the identity authority for `name`.** The DB mirrors it; `saveOrganizationProfile` writes the name to both; a new `organization.updated` webhook handler mirrors edits made in the Clerk dashboard back to the DB. Nothing else is written to `publicMetadata` any more.
- **Not a Prisma composite type** for branding: the team has not used composite types, and their update semantics are a source of bugs; flat prefixed fields with a `select` are simpler.
- **`CoachBranding` is deleted**, along with `User.branding` and the `coachBranding.deleteMany` line in `actions/admin-actions.ts`.

### 4.2 Schema

```prisma
enum ExerciseSourcePreference {
  BOTH
  UNIVERSAL
  ORGANIZATION
}

/// Canonical organization record. One per Clerk organization. Profile fields
/// were previously in Clerk publicMetadata; brand* fields are new.
model Organization {
  id                       String   @id @default(auto()) @map("_id") @db.ObjectId
  clerkOrgId               String   @unique
  /// Mirror of the Clerk organization name. Clerk is updated on every save
  /// and dashboard edits are mirrored back by the organization.updated webhook.
  name                     String
  tagline                  String?
  phone                    String?
  email                    String?
  website                  String?
  address                  String?
  exerciseSourcePreference ExerciseSourcePreference @default(BOTH)

  // ── Branding ─────────────────────────────────────────────────────────────
  /// Master switch. false → every surface uses the product defaults, even if
  /// the fields below are set. Lets a trainer preview/prepare without exposing.
  brandingEnabled   Boolean  @default(false)
  /// Name shown in the shell, title, emails. null → `name`.
  brandDisplayName  String?
  /// "#RRGGBB", lower-case. null → product primary. The only color input.
  brandPrimaryColor String?
  /// PNG on R2, for light surfaces (header, PDFs, onboarding).
  brandLogoOnLightUrl String?
  /// PNG on R2, for dark surfaces (the sidebar, email header bar). null → logoOnLight on a light plate.
  brandLogoOnDarkUrl  String?
  /// Square PNG (512×512) on R2. Source of favicon/apple-icon derivatives.
  brandMarkUrl        String?
  /// Derived from the mark at upload time (32×32 and 180×180 PNG).
  brandFaviconUrl     String?
  brandAppleIconUrl   String?
  brandUpdatedAt      DateTime?
  brandUpdatedById    String?  @db.ObjectId

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Removed: `model CoachBranding`, `User.branding CoachBranding? @relation("Branding")`.

MongoDB → `npx prisma db push` (no migrations). Both changes are additive except the `CoachBranding` collection drop, which has no data.

### 4.3 Migration from Clerk `publicMetadata`

A one-shot, idempotent script `lib/db/scripts/migrate-org-profiles-to-db.ts` (`npm run db:migrate-org-profiles`):

1. Pages through `clerkClient().organizations.getOrganizationList({ limit: 100, offset })`.
2. For each org, `upsert` an `Organization` with `name` and the metadata fields (`logoUrl` → `brandLogoOnLightUrl` only if it is an https URL; `brandingEnabled` stays `false`).
3. Prints a summary; never deletes anything from Clerk (the metadata simply stops being read).

Runtime safety net: `organizationService.getOrganization(clerkOrgId)` lazily creates the row (fetching `name` from Clerk once) when none exists, so an org created between deploy and script run, or an environment where the script was never run, still works. Trainer onboarding creates the row directly.

### 4.4 Read model for branding

```ts
// lib/branding/types.ts
export interface ResolvedBranding {
  enabled: boolean;              // false → everything below is the product default
  orgId: string | null;
  displayName: string;           // "INMOTUS RX" when disabled
  tagline: string | null;        // Organization tagline; null when disabled or blank
  primaryHex: string;            // "#204ec3"-style; product default when disabled
  logoOnLightUrl: string | null;
  logoOnDarkUrl: string | null;
  markUrl: string | null;
  faviconUrl: string | null;
  appleIconUrl: string | null;
  tokens: BrandTokens | null;    // null when disabled → no <style> emitted
  css: string | null;            // pre-built, validated CSS block (see §5.4)
  themeColor: string;            // hex for <meta name="theme-color">
}
```

`resolveBranding(record | null): ResolvedBranding` is pure and lives in `lib/branding/resolve.ts`; the service wraps it with data access and caching (§5.5). Users with `clerkOrgId == null` (legacy accounts that have not re-logged in since Clerk orgs were introduced) get the default.

Enabled with no (or an invalid) `brandPrimaryColor` → `tokens: null, css: null` (no `<style>` emitted; the page renders the exact product look from `globals.css`), while `displayName`/logos/`enabled` still apply. `primaryHex`/`themeColor` fall back to the product default hex in that case, but nothing reads them for rendering: emails, PDFs and `theme-color` all gate on `tokens` being non-null, not on `enabled` alone (§5.4, §7).

---

## 5. Theming engine

### 5.1 Input

Exactly one color input in v1: `brandPrimaryColor` as `#RRGGBB`. A second "sidebar color" knob is deferred (§10) — the sidebar is derived from the primary hue so the result is always coherent.

Validation (zod, `lib/validators/branding.ts`): `/^#[0-9a-f]{6}$/` after lower-casing. Then the color is parsed to OKLCH and the **guardrail** applied: lightness `L` must be within `[0.25, 0.80]`. Outside that range (near-black, near-white) the save is rejected with "Pick a color that is neither near-black nor near-white — it cannot produce readable buttons and highlights". Chroma is unconstrained (a gray brand is legitimate; its tints simply become neutral).

Color math uses `culori` (`oklch`, `formatHex`, `clampChroma`, `wcagContrast`) — a small, tree-shakeable, well-tested library. Hand-rolling sRGB↔OKLCH plus gamut mapping is feasible but is exactly the kind of code that is subtly wrong; the library is the lower-risk choice.

### 5.2 Overridable token whitelist

Only these tokens may be emitted. The CSS builder is typed against this list and a test asserts nothing else can appear.

| Token | Light derivation (B = brand color in OKLCH `L C H`, gamut-clamped) | Dark derivation |
|---|---|---|
| `--primary` | B, after the foreground/adjust step (§5.3) | `oklch(max(L,0.65) min(C,0.15) H)` |
| `--primary-foreground` | white or near-black by contrast (§5.3) | same rule against dark primary |
| `--ring` | = `--primary` | *(not overridden — system neutral ring in dark)* |
| `--accent` | `oklch(0.94 min(0.04,C) H)` | *(not overridden — neutral hover surface in dark)* |
| `--accent-foreground` | `oklch(0.30 min(0.10,C) H)` | *(not overridden)* |
| `--brand` | = `--primary` | = dark `--primary` |
| `--brand-foreground` | `oklch(0.36 min(0.15,C) H)`, then darkened until ≥ 4.5:1 on `--brand-soft` | `oklch(0.86 min(0.09,C) H)` |
| `--brand-soft` | `oklch(0.95 min(0.03,C) H)` | `oklch(L' C' H / 14%)` of dark primary |
| `--brand-border` | `oklch(0.87 min(0.06,C) H)` | `/ 32%` of dark primary |
| `--chart-2` | = `--primary` | = dark `--primary` |
| `--sidebar` | `oklch(0.18 min(0.04, 0.3·C) H)` | `oklch(0.15 min(0.03, 0.3·C) H)` |
| `--sidebar-gradient-end` *(new token)* | `oklch(0.15 min(0.04, 0.3·C) H)` | `oklch(0.12 min(0.03, 0.3·C) H)` |
| `--sidebar-accent` | `oklch(0.25 min(0.05, 0.35·C) H)` | `oklch(0.22 min(0.04, 0.35·C) H)` |
| `--sidebar-border` | `oklch(0.28 min(0.04, 0.3·C) H)` | *(not overridden — `oklch(1 0 0 / 10%)`)* |
| `--sidebar-primary` | `oklch(max(L,0.65) min(C,0.15) H)`, then lightened until ≥ 4.5:1 on `--sidebar` (it is used as text) | same |
| `--sidebar-primary-foreground` | white or near-black by contrast | same |
| `--sidebar-ring` | = `--sidebar-primary` | *(not overridden)* |

**Never overridable:** `background`, `foreground`, `card`, `popover`, `muted`, `secondary`, `border`, `border-strong`, `input`, `destructive`, `success*`, `info*`, `warning*`, `danger*`, `neutral*`, `chart-1/3/4/5`, `sidebar-foreground`, `sidebar-accent-foreground`, `radius`, fonts. Status colors must keep their meaning; neutral surfaces must stay neutral so contrast of everything else remains guaranteed.

`--sidebar-gradient-end` is a new token added to `globals.css` (`:root` = `oklch(0.15 0.04 264)`, `.dark` = `oklch(0.12 0.03 264)`) so `components/layout/sidebar.tsx` can stop hard-coding the gradient end.

Sanity check that doubles as a test: deriving from the product's own primary (`oklch(0.47 0.19 264)` ≈ `#204ec3`) must reproduce the existing `globals.css` values within a small tolerance. That confirms the derivation encodes the design system rather than inventing a new look.

**Accepted AA deviations from the pre-branding look:** the product's own hard-coded white text on `--sidebar-primary` and on dark-mode `--primary` was only 3.29:1 (fails AA). Deriving even the product's *own* color through this engine therefore flips those two pairs to near-black text (§5.3 correctly picks the passing option) — a visible change versus today, but only for orgs with branding enabled; the unbranded product look in `globals.css` is untouched and keeps its existing white text.

The settings page's live preview (`components/settings/brand-preview.tsx`) falls back to `DEFAULT_LIGHT_TOKENS` — a light-mode token set mirroring these same `globals.css` values — whenever there is no valid color yet (none set, or the in-progress hex is invalid), so the preview never goes blank or inherits the page's own live brand style while claiming to show the default look.

### 5.3 Contrast-safe foreground and adjustment

For any background token `bg` that carries text (`primary`, `sidebar-primary`):

1. `fg = white` if `wcagContrast(bg, white) ≥ 4.5`.
2. Else `fg = oklch(0.13 0.02 H)` if that reaches 4.5.
3. Else **adjust** `bg`: step `L` by ±0.01 toward whichever direction increases contrast with white until 4.5 is met (bounded to 60 iterations; proven terminating because L→0 gives ≥ 4.5 against white). Record `adjusted: true` and the delta.

4.5:1 is the WCAG AA threshold for normal text; buttons and nav labels are 14 px regular weight, so the large-text 3:1 relaxation does not apply.

For text-on-tint pairs (`brand-foreground` on `brand-soft`, `accent-foreground` on `accent`, `sidebar-primary` on `sidebar`) the same step-until-4.5 loop runs on the text color.

The result type carries `meta: { adjusted: boolean; adjustedFromHex?: string; primaryForeground: "light" | "dark"; contrastOnPrimary: number }` so the settings UI can say "We darkened `#337bba` slightly so white text stays readable" and show the ratio.

### 5.4 Server-rendered injection

`components/branding/brand-style.tsx` (server component) renders

```html
<style id="org-brand">:root:not(.dark){--primary:oklch(0.470 0.190 264.000);…}:root.dark{…}</style>
```

inside the platform layout, before `Sidebar`. `BrandStyle` is also rendered on `/onboarding/client` and both sales-page routes (`app/p/[slug]/page.tsx`, `app/p/[slug]/success/page.tsx`) — every surface in §7 that shows a client-facing brand outside the platform shell. Reasons:

- A `<style>` element applies globally regardless of where it sits in the body, so portals (dialogs, popovers, toasts, command palette) that render outside `[data-app-shell]` are branded too. Scoping to `[data-app-shell]` would leave portals indigo.
- It is in the RSC payload of the layout, so first paint is branded (no FOUC). Client navigations keep the layout, so it persists.
- The light block uses `:root:not(.dark)` (specificity 0,2,0) so it beats globals.css `:root` (0,1,0) in light mode and simply doesn't match under `<html class="dark">`, where `:root.dark` (0,2,0) applies; the dark-only neutral tokens from globals.css `.dark` (`ring`, `accent`, `accent-foreground`, `sidebar-border`, `sidebar-ring`) are therefore never overridden by light values.
- The marketing site, sign-in and admin shell never render it.

`dangerouslySetInnerHTML` is used exactly here, on a string produced by `buildBrandCss(tokens)`, which formats every number with `toFixed(3)` and interpolates nothing from user input. A unit test asserts the output matches `^:root:not\(\.dark\)\{(--[a-z0-9-]+:oklch\([0-9.]+ [0-9.]+ [0-9.]+( \/ [0-9.]+%)?\);)+\}:root\.dark\{…\}$` and that every property name is in the whitelist. The Route/Server Action layer never touches CSS.

`<meta name="theme-color">` is set via the platform layout's `generateViewport`, through the pure helper `brandViewport` (`lib/branding/metadata.ts`) next to `brandIconsMetadata`: it returns `{ themeColor: branding.themeColor }` only when branding is enabled **and** a color produced tokens, else `{}` (no key at all, so the browser/Capacitor status bar keeps its own default) — an org that only set a name/logo, or hasn't branded at all, never gets a new `theme-color` on mobile. `/onboarding/client` and the `/p` pages render `BrandStyle` but do not set their own viewport, so they are unaffected either way.

### 5.5 Caching and invalidation

```ts
// lib/services/branding.service.ts
export const brandingTag = (clerkOrgId: string) => `org-branding:${clerkOrgId}`;

const loadBranding = unstable_cache(
  async (clerkOrgId: string) => {
    const record = await prisma.organization.findUnique({ where: { clerkOrgId }, select: BRANDING_SELECT });
    return resolveBranding(record);          // pure; includes tokens + css
  },
  ["org-branding"],
  { revalidate: 3600, tags: [/* set per call below */] }
);

export const getOrgBranding = cache(async (clerkOrgId: string | null) =>
  clerkOrgId ? loadBrandingTagged(clerkOrgId) : resolveBranding(null)
);
```

- `React.cache()` dedupes within a request: the layout, `generateMetadata`, the sidebar identity block and any page all share one call.
- `unstable_cache` with tag `org-branding:<id>` and a 1 h TTL is the cross-request layer. Every mutation (save, reset, asset confirm/remove) calls `updateTag(brandingTag(id))` from the Server Action, which gives read-your-own-writes on the trainer's `router.refresh()`. `revalidateTag(tag, "max")` is *not* used for the trainer's own save because its stale-while-revalidate profile can serve the old brand on the very next request.
- The plan includes an explicit verification step: after save + refresh the new color must be visible. If `updateTag` turns out not to expire `unstable_cache` entries in 16.1.6, the fallback is documented in the plan (drop `unstable_cache`, keep `React.cache()`; the read is a single indexed `findUnique`, ~5–15 ms, on a layout that already runs five queries). Correctness beats a cache.
- Clients of the org see the change on their next navigation (layout re-renders per request; no client-side cache of the style).

---

## 6. Logos and assets

### 6.1 Variants

| Kind | Used on | Stored size | Fallback when absent |
|---|---|---|---|
| `logo-on-light` | Header (mobile fallback title), client onboarding, PDFs, sales page | max 256 px tall, width ≤ 1024, PNG, alpha preserved | display name as text |
| `logo-on-dark` | Sidebar top block (always dark), mobile sheet sidebar, client-email header bar | same | `logo-on-light` inside a light rounded plate (`bg-card`), else mark + name; in emails: display name as text (never the light logo) |
| `mark` | Sidebar when collapsed/narrow, avatar-sized contexts, favicon source | 512×512 PNG, contain-fit with transparent padding | initial-letter tile in `--primary` with computed foreground |
| `favicon-32`, `apple-180` | `<link rel="icon">` / apple-touch-icon via `generateMetadata.icons` | derived from mark at upload | product favicon |

Every variant is optional. Fallbacks are defined so any combination renders sensibly and nothing shifts: the sidebar identity block is a fixed `h-16` row with a fixed-height image box (`h-8`, `object-contain`, explicit `width`/`height` attributes).

The product favicon itself is `public/favicon.ico`, declared as config metadata (`PRODUCT_ICONS` in `lib/branding/metadata.ts`) on the root layout's `metadata.icons` — not the `app/favicon.ico` file convention, which Next always prepends to `icons.icon` even under a nested layout that sets its own `icons`; a config value is replaced wholesale instead, which is what lets the platform layout fully take over `icons` for a branded org.

### 6.2 Upload pipeline

`POST /api/branding/assets` (Route Handler, multipart `file` + `kind`):

1. `requireRole("TRAINER")`-equivalent check via `auth()` + DB user; 403 without `clerkOrgId`.
2. Reject if `Content-Length` or buffer > **2 MB**; reject declared MIME not in `image/png|jpeg|webp`.
3. `sharp(buffer).metadata()` — the real decoder decides. Reject `format ∉ {png,jpeg,webp}`, width/height > 4096, or below the minimum for the kind (logo ≥ 64 px tall, mark ≥ 128 px). SVG is rejected here even if mislabelled (sharp reports `svg`).
4. Re-encode with sharp → PNG (strips metadata/EXIF, normalises orientation, and converts anything malicious-but-valid into plain pixels). For `mark`, also produce 32 and 180 px derivatives.
5. `PutObject` to `branding-pending/<clerkOrgId>/<uuid>-<kind>.png` (+ derivatives `<uuid>-favicon-32.png` / `<uuid>-apple-180.png`), `Cache-Control: public, max-age=31536000, immutable`. Pending uploads live under the single literal prefix `branding-pending/` so one R2 lifecycle rule — **expire `branding-pending/` after 1 day** — clears every org's abandoned uploads (R2 lifecycle prefixes are literal, not globs); final assets stay under `branding/<clerkOrgId>/`, and only `branding/` URLs pass `isOwnAssetUrl`.
6. Return `{ pendingKeys: { primary: string, derivatives: string[] } }` — `derivatives` is `[favicon-32, apple-180]` (same UUID as `primary`) for `mark`, `[]` otherwise. (No `previewUrl`: `LogoUploader` never renders the pending object — it keeps showing the current image with a text progress label ("Uploading…"/"Saving…") until `confirmBrandAsset` succeeds and `router.refresh()` brings back the real, final URL.)

Then the client calls the Server Action `confirmBrandAsset({ kind, pendingKey, derivativeKeys? })`, which:

1. Validates `pendingKey` against `^branding-pending/<callerOrgId>/<uuid 8-4-4-4-12 lower hex>-<kind>\.png$` — the org id in the key must equal the caller's; this is what stops one org confirming another's upload. `derivativeKeys` must be exactly the kind's set (mark → `favicon-32` + `apple-180`; logos → none), org-scoped and carrying the primary's UUID. All of this happens before any R2 call.
2. `HeadObject`s each pending object (must exist, ≤ 2 MB, `image/png`) and `CopyObject`s it to the final key `branding/<clerkOrgId>/<kind|suffix>-<hash[:8]>.png`, where the hash is the single-part ETag (MD5 of the bytes) or, for a multipart ETag, a sha256 of the body (content-hashed → new upload = new URL, so `immutable` caching is safe, and re-confirming identical bytes is idempotent).
3. Updates the record only after every copy landed, then best-effort deletes the pending objects and the kind's previous own final objects, `updateTag`, audit `BRANDING_UPDATED` with `{ assets: [kind] }` (never URLs). The DB never points at a missing object, and no object is deleted while the record still references it: a failed confirm (Head/Copy/DB error) does **not** roll back — any finals it copied are left as orphans (swept by reset, and reused by the next identical upload since keys are content-addressed), because a concurrent confirm or an update that committed despite erroring may already reference them. Previous-final cleanup re-reads the record first and skips any key referenced by any brand field. A Head `404`/`NotFound`/`NoSuchKey` means the upload expired; other storage errors ask the user to retry. `removeBrandAsset({ kind })` clears the field(s) (the mark also clears favicon/apple icon), best-effort deletes the objects and audits `{ assets: [kind], removed: true }`.

Why a Route Handler and not a presigned PUT: the bytes must be inspected and re-encoded by us; a presigned PUT would let arbitrary bytes (including SVG with scripts) land on a public URL. Why not a Server Action: default 1 MB body limit and no streaming. Why pending→confirm: it matches the repo's voice-memo pattern, keeps every DB mutation and audit write in Server Actions, and orphans from abandoned uploads are confined to `branding-pending/` (an R2 lifecycle rule expiring that prefix after 1 day is a one-line ops task noted in the plan).

`PNG` everywhere because `@react-pdf/renderer` cannot decode WebP, and because alpha is required for logos on dark surfaces.

### 6.3 Rendering rules

- `OrgIdentity` (`components/branding/org-identity.tsx`, presentational component) takes the `BrandingViewModel` and a `surface: "dark" | "light"` prop and applies the fallback table. It is used by `Sidebar` (dark; both the desktop rail and the mobile sheet's copy), client onboarding and the sales page. `Header`'s own top bar does *not* use it: its "no breadcrumbs" fallback is always plain `branding.displayName` text, never a logo — the header's brand surface is the mobile-sheet `Sidebar` it renders, not the bar itself.
- Image `src` is rendered only when it starts with `R2_PUBLIC_URL` (`lib/branding/asset-kinds.ts: isOwnAssetUrl` — the browser-safe module; `lib/branding/assets.ts` is the server-only upload/R2 half); anything else is treated as absent. Belt-and-braces against a bad row.
- Plain `<img>`, not `next/image`, with explicit `width`/`height`: these are small, immutable, already re-encoded PNGs on our own R2 host, so the optimizer would add a round trip for nothing and couple the page to `next.config`'s `images.remotePatterns`.
- Alt text is the display name.

---

## 7. Where branding applies

| Surface | Trainer sees | Client sees | Phase |
|---|---|---|---|
| Platform shell tokens (buttons, links, focus rings, active nav, badges, brand callouts, charts' second series) | org brand | org brand | 1 |
| Sidebar identity block, header fallback title | org logo/name; subtitle "Trainer Portal" | org logo/name; "Client Portal" | 3 |
| `<title>` template, favicon, apple-touch-icon, `theme-color` | `%s \| Summit PT` | same | 3 |
| Clerk embedded UI (`UserProfile`, `UserButton`) | follows `var(--primary)` automatically | same | 1 |
| Client onboarding (`/onboarding/client`) — org is the DB user's `clerkOrgId` once that row exists, else falls back to `auth().orgId` (display only; a freshly invited client mid-SignUp has no DB row yet) | n/a | org logo/name and color | 4 |
| Sign-in / sign-up | product | product (org unknown pre-auth; see §10) | — |
| PDFs (workout-plan and program routes) | org name, tagline, logo-on-light, primary as heading accent; an unbranded org still shows its own name/tagline (never "INMOTUS RX"), and a legacy external (Clerk) logo URL is always ignored, never fetched | same | 3 |
| Emails **to clients** (session reminder, program welcome, share program, new message, check-in, nutrition, feedback response, voice memo added, nutrition comment) | n/a | org name, logo, accent; From display name = org (§12.5). The logo sits on the accent bar, which is always darkened for white text, so emails use `logo-on-dark` (none → org name as text) | 4 |
| Emails **to trainers** (session completed, missed session, billing) | INMOTUS RX | n/a | — |
| Sales page `/p/[slug]` and its success page | n/a | selling org's brand | 4 |
| Settings → Billing, trial banners, marketing pages, admin shell | INMOTUS RX | n/a | — |
| Mobile (Capacitor webview) | inherits web | inherits web; native icon/splash stay INMOTUS RX | 3 (`theme-color`) |

Principle: **brand follows the recipient's relationship.** A client's relationship is with their coach, so everything a client receives carries the org brand. A trainer's relationship with INMOTUS RX (billing, product emails) stays product-branded even though their working shell is branded. A "Powered by INMOTUS RX" line in the client sidebar footer is the default (§12.3).

---

## 8. Settings UX

Route: `/settings/branding` (trainer only, under the existing Settings sub-nav in `components/layout/sidebar.tsx`, next to Organization and Audit Log). Built from `PageShell width="narrow"` + `PageHeader` + `FormSection`/`FormField`, like `/settings/clinic`.

Sections:

1. **Custom branding** — `Switch` "Use custom branding for my organization" (`brandingEnabled`). Off = everything below is saved but not applied; the preview still reflects it so trainers can prepare before flipping it on.
2. **Identity** — Display name (defaults to org name; max 60 chars). Logo on light background, logo on dark background, square mark: three `LogoUploader` dropzones (PNG/JPEG/WebP ≤ 2 MB), each showing the current image on the matching surface color, with Replace/Remove. Upload progress states mirror `useVoiceMemoUpload` (`idle/uploading/confirming/done/error`).
3. **Color** — `ColorField`: native `<input type="color">` plus a hex text input (they stay in sync), swatch. Under it, a live contrast readout computed client-side with the same pure module: "White text on your color: 5.4:1 — passes AA", or the amber warning "We darkened your color slightly (#337bba → #3178b6) so text stays readable" (`meta.adjusted`), or the blocking error for out-of-range lightness (the same rule the server enforces).
4. **Preview** — `BrandPreview`: a self-contained mock (`div` with the derived tokens applied as inline CSS custom properties, so nothing global changes while editing) showing a mini sidebar with an active nav item, a primary button, an outline button, a `StatusBadge role="brand"`, a brand-soft callout, and a link. **As built, only the light panel is rendered** (from `tokens.light`, falling back to `DEFAULT_LIGHT_TOKENS` — §5.2 — with no valid color); a second panel from `tokens.dark` is deferred until the app ships a user-facing theme toggle, since dark mode is otherwise unreachable.
5. **Actions** — Save (disabled until dirty, `Loader2` spinner, `toast`), and **Reset to defaults** (destructive-styled outline button → `ConfirmDialog` → clears all `brand*` fields and deletes assets from R2 best-effort; audit `BRANDING_RESET`).

No-org empty state (a legacy trainer with `clerkOrgId == null`) mirrors `/settings/audit-log`'s `EmptyState`.

`/settings/clinic` stays as the profile page (name, tagline, contact, exercise library preference); its description no longer claims to be about branding, and it links to the branding page. The logo field is removed from it (logos now live under Branding).

### 8.4 Permissions

Any user with `role === "TRAINER"` and a `clerkOrgId` may edit their own org's branding — identical to the existing `/settings/clinic` rule. There is no admin/member split among trainers today (Clerk org roles are unused), so introducing one just for branding would be inconsistent; the audit log records who changed what. Clients can never call the actions (403). Super admins have no edit UI in this feature (deferred).

### 8.5 Audit logging

- `AUDIT_ACTIONS.BRANDING_UPDATED` — metadata is `diffFields(before, after, ["brandingEnabled","brandDisplayName","brandPrimaryColor"])` plus `assets: ["logo-on-dark"]` for asset confirms/removals (URLs are not logged; kind names only).
- `AUDIT_ACTIONS.BRANDING_RESET` — no metadata.
- Labels added to `components/audit-log/audit-log-table.tsx`; `targetType: "Organization"`, `targetId`/`orgId`: `clerkOrgId`.

---

## 9. Security, validation and performance

- **Authorization**: every action and the upload route resolve the DB user from `auth()` and use *their* `clerkOrgId`; no org id is ever accepted from the client. Clients (`role === "CLIENT"`) are rejected. Asset keys are validated to embed the caller's org id.
- **Input validation** (zod): `hexColor` regex; display name trimmed, 1–60 chars, no control characters; `kind` enum; pending key regex. Whole-object schemas exported from `lib/validators/branding.ts` and reused by the form for instant feedback.
- **CSS injection**: impossible by construction (§5.4) — user input is a hex string that is parsed to numbers; only our formatter emits CSS; a test guards the output grammar and the property whitelist.
- **HTML/XSS**: display name and alt text render through React (escaped). Logos are our own re-encoded PNGs from our bucket prefix; SVG is rejected at MIME, decoder and confirm stages.
- **Upload abuse**: 2 MB cap, decoder-verified format, dimension caps, per-org key namespace. Rate limiting is not added (stateless deployment; noted in §10).
- **Performance**: one deduped, cached DB read per request; zero Clerk calls on the read path (Phase 0 also removes the four page-render Clerk calls that exist today); tokens computed once per cache fill; the `<style>` block is ~1.5 KB; logos are immutable-cached PNGs ≤ 256 px.
- **No layout shift**: fixed identity-block dimensions and explicit image sizes; style tag server-rendered.
- **Privacy**: logos are public assets by nature; contact fields already were. No PHI is involved.

---

## 10. Deferred and out of scope

| Item | Why not now |
|---|---|
| Custom domains (`coach.example.com`) | DNS/SSL provisioning, Clerk satellite domains, cookie scoping, Vercel domain API — a multi-week project on its own. The `customDomain` column of `CoachBranding` was never wired; it is dropped, not carried. |
| Custom fonts | Font loading is a performance and licensing surface; Inter + Lexend are part of the design system's readability guarantees. |
| SVG logos | Needs a DOM-based sanitizer server-side and still risks CSS/foreignObject tricks; rasterising defeats the point. PNG with alpha at 2× covers the visual need. |
| Second color knob (sidebar/surface color) | Derived sidebar from the primary hue is coherent by construction; a free sidebar color reopens the contrast problem. Revisit with real demand. |
| Dark-mode toggle | Not a branding concern; the tokens are generated so a toggle can ship independently. |
| Branded sign-in / sign-up | The org is unknown pre-auth. Requires org-specific links (`/sign-in?org=slug`) or custom domains. |
| Per-tenant mobile binaries (icon, splash, store listing) | One App Store binary; Apple 4.2.6 discourages template apps. The webview inherits web branding. |
| Super-admin editing/viewing another org's brand | Small, but a separate admin feature; the record is visible in Prisma Studio meanwhile. |
| Syncing the logo to Clerk's org `imageUrl` (`updateOrganizationLogo`) | Would brand Clerk-hosted invitation emails and org switcher; nice-to-have follow-up once R2 is the source of truth. |
| Upload rate limiting | Needs shared state (Upstash/KV); size and auth limits suffice for launch. |
| Tier gating of the feature | Decision pending (§12.1); if chosen, it is a one-line check in `saveBrandingSettings` and the settings page gate, plus copy. |
| Marketing pricing table consistency | The marketing tiers ("Professional", "Practice $149") do not match `TIER_CONFIG` (`STARTER/PRO/UNLIMITED`). This feature only fixes the branding claim (§12.1); reconciling the tables is separate. |

---

## 11. Phases (summary — the plan has the task breakdown)

| Phase | Ships | Visible change |
|---|---|---|
| 0 — Foundation | `Organization` model, migration script, profile actions/PDF read from DB, `organization.updated` webhook, `CoachBranding` removed | None (behavioural parity; four Clerk calls per render disappear) |
| 1 — Theming engine | `lib/branding/*` (color, tokens, css, resolve) + tests, `branding.service` with cache, `BrandStyle` in the platform layout, `--sidebar-gradient-end` token | None until a record has `brandingEnabled=true` (verifiable via Prisma Studio) |
| 2 — Settings | `/settings/branding` (switch, display name, color, preview, reset), actions + validators + audit, sidebar nav entry, marketing copy | Trainers can brand colors and name; shell header/sidebar show display name |
| 3 — Assets | Upload route + sharp, R2 pending/confirm, `OrgIdentity` in sidebar/header, favicon/title/theme-color metadata, both PDF routes | Logos everywhere in the app and PDFs |
| 4 — Client-facing reach | Client onboarding, sales page, client emails via `EmailLayout`, "Powered by" footer | Clients see the brand outside the shell |

Each phase is independently shippable and leaves the app in a consistent state.

---

## 12. Open questions (user decisions)

1. **Tier gating.** Marketing lists branding under a "Practice $149" tier; `TIER_CONFIG` has no feature gates. *Recommended default:* no gating at launch (available to every active/trialing trainer), and change the marketing bullet so "Custom organization branding" appears under every tier that has it. Gating later is a one-line check.
2. **Who can edit.** *Default:* any `TRAINER` in the org (matches `/settings/clinic`).
3. **"Powered by INMOTUS RX".** Show a small line in the client sidebar footer when branding is enabled? *Default:* yes (growth channel, common in white-label-lite tiers); make it a later per-tier toggle if a true white-label tier is introduced.
4. **Move the org profile to the DB (Phase 0).** Reverses the 2026-05-31 "extra metadata in Clerk" decision. *Default:* yes — per-request theming and the four existing Clerk-call page renders both require it.
5. **Email sender identity.** For client emails: From display name = org display name at the existing verified address (`Summit PT <noreply@send.goinmotus.com>`), Reply-To = org contact email when set. *Default:* yes. (Custom sending domains are out of scope.)
6. **SVG logos.** *Default:* reject in v1 (PNG/JPEG/WebP in, PNG out).
7. **Sales page branding.** Brand `/p/[slug]` with the selling org? *Default:* yes, in Phase 4 (same component, cheap).
8. **Trainer-side scope.** Brand the trainer's whole shell (default) or only client-facing surfaces? *Default:* whole shell — trainers expect to see their brand, and one code path is simpler.
9. **Legacy accounts** with `clerkOrgId == null`: leave them on defaults with the "No organization set up" empty state (default), or backfill orgs for them? *Default:* leave; they self-heal on next login via `getCurrentUser`.

---

## 13. Decision log

| Decision | Alternatives considered | Reason |
|---|---|---|
| DB `Organization` record is canonical | Keep Clerk metadata; separate `OrganizationBranding` model | Read path must avoid Clerk; one record, sub-KB, `select` on the hot path |
| Key by `clerkOrgId` | Key by trainer | Clients and everything else already scope by org; multi-trainer safe |
| One color input, everything derived | Full token editor; primary + secondary | Guarantees coherence and contrast; editors produce unreadable UIs |
| OKLCH via `culori` | Hand-written conversions; HSL | Perceptual uniformity makes fixed-L tints look consistent across hues; library avoids gamut-mapping bugs |
| Global `<style>` from the platform layout | Scoped `[data-app-shell]` vars; `data-theme` attribute on `<html>` | Portals must be branded; root layout must stay unbranded for marketing/admin |
| `unstable_cache` + `updateTag`, with a documented fallback | No cache; `revalidateTag('max')` | Meets the "cached + invalidated" requirement while keeping read-your-own-writes; falls back to a single indexed read if the API misbehaves |
| Route Handler upload + sharp re-encode, pending→confirm | Presigned PUT; Server Action upload | Bytes must be validated; Server Actions cap at 1 MB; matches the voice-memo pattern |
| PNG only in storage | Keep original format; WebP | `@react-pdf` needs PNG/JPEG; alpha needed on dark surfaces |
| Reject SVG | Sanitize with DOMPurify | Sanitizers are bypassable; no real need |
| Drop `CoachBranding` | Repurpose | Wrong scope and fields; zero data |
