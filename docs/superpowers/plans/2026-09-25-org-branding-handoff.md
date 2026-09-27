# Org Branding — Hand-off (branch `org-branding`, 2026-09-26)

All 25 plan tasks (Phases 0–4) are implemented, each task reviewed, each phase reviewed, and a final whole-branch review passed. Nothing is committed. Spec: `2026-09-25-org-branding-design.md`; plan: `2026-09-25-org-branding.md`.

**Verified:** vitest 1919 pass (5 failures are pre-existing and untouched by the branch: 3 × `admin-actions` deleteUserAction, 2 × `client-dashboard-render` date-boundary flake); `tsc` clean; `lint:palette` 0; `next build` exit 0.
**Not verified:** anything live. All `.env` systems are production, so no schema push, migration, upload, email or browser pass was run.

## Production rollout (in this order)

0. Snapshot the production DB (Atlas snapshot or `mongodump`). Decide the final R2 public domain **before any upload** — `CLOUDFLARE_R2_PUBLIC_URL` is currently an `r2.dev` URL (rate-limited, not for production), and stored logo URLs are tied to it.
1. Check what `prisma db push` will apply: it pushes the whole schema, including any push still pending from earlier branches (e.g. email-notifications). Compare the `@unique`/`@@index` entries with production.
2. `DATABASE_URL="<prod>" npx prisma db push` — creates `Organization` + unique index on `clerkOrgId`. **Must happen before deploy**: without the index, concurrent lazy-creates can insert duplicate rows, and those block the index later.
3. Optional: `db.CoachBranding.countDocuments()` → if 0, `db.CoachBranding.drop()`.
4. Run the migration with the **live** Clerk key (the script loads `.env`, which holds `sk_test`; command-line vars win):
   `CLERK_SECRET_KEY=sk_live_… DATABASE_URL="<prod>" npm run db:migrate-org-profiles` — "N created" should equal the production Clerk org count. It's idempotent; a second run reports 0 created.
5. Deploy straight away (clinic-settings edits made on old code between steps 4 and 5 go to Clerk only; re-run step 4 within minutes of deploy if needed — it overwrites DB edits).
6. Clerk dashboard (production) → webhook endpoint → subscribe `organization.updated`.
7. R2 → bucket → lifecycle rule: delete prefix `branding-pending/` after 1 day.

## What orgs with branding OFF will notice
- Trainers: new Settings → Branding page; `/settings/clinic` loses the logo-URL field and gains a Branding link.
- Program PDFs show the org's own name instead of "INMOTUS RX"; legacy pasted (Clerk) logos no longer appear on PDFs — trainers re-upload under Branding.
- Client onboarding left panel uses the sidebar's navy gradient and lockup.
- `/p/[slug]` and its success page show an "INMOTUS RX" lockup; titles become "<package> | INMOTUS RX" / "Payment successful | INMOTUS RX".
- Marketing pricing lists "Custom organization branding" on every tier.
- Unchanged: shell, sidebar, header, favicon, theme-color, all emails.

## Manual QA (use a test trainer + client, your own inbox)
1. Unbranded parity: shells, favicon, titles, emails, both PDFs (org name/tagline).
2. `/settings/clinic`: migrated values, save → audit entry, Clerk name updated.
3. `/settings/branding`: `#337bba` shows the amber "darkened to #3178b6" notice; `#fafafa` blocks Save; preview shows the default look when no color is set.
4. Save → shell turns the brand color on the same refresh (the one live check of `updateTag` vs `unstable_cache`); dialogs/toasts/popovers branded; client sees it on next navigation.
5. Uploads: light/dark/mark as PNG/JPEG/WebP incl. an EXIF-rotated phone photo; rejections for SVG-renamed-.png, >2 MB, too small, animated. Replace → old object gone, `branding-pending/` empty. Favicon/apple icon change. Sidebar fallbacks (dark logo → light logo on plate → mark+name → initial tile).
6. Branded PDFs: logo + accent.
7. Branded client: "Powered by INMOTUS RX" line, onboarding page, `/p/[slug]` + success page, emails (message, check-in, reminder, share, nutrition, program welcome): From "Org" <noreply@…>, Reply-To = org email, dark logo or name on the header bar. Trainer and billing emails stay INMOTUS RX.
8. Rename in clinic settings and in the Clerk dashboard (webhook mirrors it).
9. Toggle off → product look; Reset → everything cleared, both R2 prefixes emptied.
10. Signed-out upload → "session expired" message; client → redirected from `/settings/branding`, 403 from upload route.
11. Mobile / Capacitor sheet sidebar.

## Follow-ups (not blocking)
- Delete brand assets on Clerk `organization.deleted`; periodic sweep of orphaned finals from failed confirms.
- Rate limiting on `POST /api/branding/assets`.
- `/p/[slug]` now includes the seller relation — if a trainer's User row is deleted, the page 500s (fulfilment was already broken in that case).
- Pre-existing: `client-dashboard-render` date flake; `pain-trend-chart` ("use client") pulls prisma into the client graph; bad-zlib base64 placeholder in the workout-plan PDF route (dormant).
- Small test gaps: onboarding `organization.create`, signed-out `resetBranding`.

## Decisions made during implementation
- **No DB/R2/email/browser actions by agents** — production-only environment; the permission system also blocked a read-only prod check.
- **Default brand hex `#204ec3`** (computed from `oklch(0.47 0.19 264)`), not the plan's `#4f46e5`; examples fixed (`#337bba` adjust case, `#42808a` fails-both case).
- **AA wins over the old tokens** for branded orgs: dark text on the light sidebar-primary and dark-mode primary (white was 3.3:1).
- **Branding on without a color = exact product look** (no CSS, no theme-color, product email/PDF accents).
- **Injected CSS uses `:root:not(.dark)` / `:root.dark`** so a future dark mode isn't overridden.
- **Settings logo-URL field removed**; http legacy logos cleared on save; legacy external logos ignored everywhere (removes a server-side fetch of arbitrary URLs).
- **Pending uploads under one prefix `branding-pending/`** so one lifecycle rule covers them.
- **Failed confirms never delete** newly copied objects (avoids deleting what the DB points at); cleanup re-reads the record first.
- **Favicon moved to `public/favicon.ico`** + root `metadata.icons`, so branded favicons replace it.
- **PDFs**: org name/tagline always from the Organization row; brand name/accent/logo only when enabled.
- **Client onboarding** uses the DB user's org, falling back to the session org only before the DB user exists (display only).
- **Emails**: dark logo on the (always dark) accent bar, else org name; From name/Reply-To only when branded; display names stripped of control, bidi, zero-width chars and `@`; sender env may be "addr" or "Name <addr>".
- **Display names** allow joined emoji (ZWJ) but not other invisible/format characters.
- **Header fallback title** shows the display name as text (not the logo).
- **Programs PDF shows the org's own name** even when unbranded (one shared helper for both PDFs).

The full decision log (with cost-if-wrong for each) is in the git-ignored ledger `.superpowers/sdd/2026-09-25-org-branding/progress.md`.

## Live test on org_3BneRdwN79R0u2qS02YXVu0zRTB (2026-09-26, local dev server → production DB/R2)
Schema pushed and the one-org migration run by the user (`--org=` flag added to the migration script). Tested in Chrome as the org's trainer: color checks (adjusted/near-white/invalid), save → instant re-theme, server-rendered style + theme-color, audit entries (update + reset), all three uploads to R2 with content-addressed names, rejections (SVG-as-PNG, 3.3 MB, too small), remove (object deleted, sidebar fallback), identical re-upload, toggle off (exact product look) / on, reset (all fields cleared, all R2 objects 404), branded program PDF (logo + accent + name). No console errors.
Fixed from that pass: doubled tab titles ("X | INMOTUS RX"); stale "Unity Health" titles on two program pages; light-logo hint wrongly said "in emails"; stale near-white warning while a color is half-typed; cramped sidebar logo plate; vague image-size error (now states the minimum/maximum).
Not yet tested live: client view, branded client emails, public sales page, client onboarding, workout-plan PDF (no UI reaches it).
