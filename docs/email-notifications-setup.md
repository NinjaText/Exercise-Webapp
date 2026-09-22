# Email notifications — setup

This document is for whoever turns the email notification system on in a real
environment. The code (Tasks 1–12) and the cron registration (Task 13) are
done. What's left is configuration, one database migration, and manual QA —
all listed below.

## 1. Run the database migration (your action — not yet done)

**The `NotificationPreference` collection does not exist yet.** Nothing that
reads or writes per-user email preferences will work — including the
`/settings/notifications` page and the unsubscribe links in every email —
until you run:

```
npx prisma db push
```

This was deliberately **not run** as part of this build: `DATABASE_URL`
points at a MongoDB Atlas cluster that is plausibly a live production
database, so no automated step was allowed to touch it. You need to run it
yourself, after reviewing `prisma/schema.prisma`.

What the push actually does:
- Adds a new `NotificationPreference` collection with unique indexes on
  `userId` and `unsubToken`.
- Adds one optional relation field (`notificationPreference`) to `User`.

What it does **not** do: MongoDB is schemaless, so `db push` does not read or
rewrite any existing document, and there is no backfill step to run. Every
user who has no `NotificationPreference` row simply gets defaults —
`getPreference` (in `lib/services/notification-preference.service.ts`)
returns `{ emailEnabled: true, sessions: true, messages: true, nutrition:
true, billing: true }` for anyone without a row. A row is created lazily the
first time a user saves their preferences or is issued an unsubscribe token.

## 2. Cron registration (done in this task)

`vercel.json` now registers `/api/reminders` as a fourth cron, alongside the
three that already existed:

```json
{
  "crons": [
    { "path": "/api/cron/mark-missed-sessions", "schedule": "0 * * * *" },
    { "path": "/api/cron/retry-program-purchases", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/nutrition-nudges", "schedule": "0 22 * * *" },
    { "path": "/api/reminders", "schedule": "0 9 * * *" }
  ]
}
```

`0 9 * * *` is 09:00 UTC daily. `/api/reminders` looks 24 hours ahead and
dedupes per session via `metadata.sessionId` on the `SESSION_REMINDER`
notification, so one run a day is correct, and if two runs somehow overlap
it's harmless — the second one sees the same sessions already reminded and
sends nothing.

`app/api/reminders/route.ts` enforces `CRON_SECRET` (as
`Authorization: Bearer <CRON_SECRET>`) only when that variable is set, and
skips the check otherwise. This means registering the cron is safe whether
or not the secret is configured yet — Vercel Cron will call it either way.

## 3. Required environment variables

| Variable | Where | Purpose |
|---|---|---|
| `RESEND_API_KEY` | Preview, Production | Resend API key. Without it, `sendEmail` catches the error and returns `false` for every send; nothing else breaks (see below). |
| `RESEND_FROM_EMAIL` | Preview, Production | Verified sender address. Defaults to `noreply@inmotusrx.com` (`lib/email/send.ts`) if unset. |
| `NEXT_PUBLIC_APP_URL` | all | Base URL used to build links in emails (session links, unsubscribe links, settings links). Falls back to `https://inmotusrx.vercel.app` if unset (`lib/utils/app-url.ts`) — already used by other features (Stripe checkout, invites), so it is very likely already set; confirm the value is correct for each environment rather than assuming it needs to be added. |
| `CRON_SECRET` | Production | Enforced by `/api/reminders` (and the other cron routes) when present. Not required for the cron to function, but recommended before going live so the endpoint can't be triggered by anyone who finds the URL. |

## 4. Resend account

1. The sending domain (`inmotusrx.com`, or whatever `RESEND_FROM_EMAIL` uses)
   must be verified in Resend with SPF and DKIM records. Until it is, mail
   either fails outright or lands in spam.
2. Prefer provisioning Resend through the Vercel Marketplace integration
   (`vercel integration add resend`), which manages `RESEND_API_KEY` across
   environments, over pasting the key into Vercel's environment variable UI
   by hand.

## 5. Behavior without a Resend key

`sendEmail` (`lib/email/send.ts`) never throws. A missing API key, a Resend
outage, or a template that fails to render all resolve to `false`. In-app
notifications, server actions, and cron routes all continue to work
normally — this is why Tasks 1–12 could be built and tested with no Resend
account configured at all.

## 6. Adding a new notification type

1. Add the constant to `NOTIFICATION_TYPES` in `lib/notifications/types.ts`.
2. Add an entry to `NOTIFICATION_REGISTRY` in `lib/notifications/registry.ts`.
   `template: null` is a valid, permanent state meaning "in-app only" — but
   as of this task every one of the 17 registered types has a real template
   (see "Known baselines" below).
3. Call `notifyUser` at the call site. Nothing else is required.
4. Pick the `accent` color deliberately. `EmailLayout`
   (`lib/email/templates/layout.tsx`) defaults `accent` to brand blue
   (`#2563eb`) if the template doesn't pass one. Two categories already
   deviate on purpose: `session-completed` and `voice-memo-added` use green
   (`#16a34a`) for a positive/completed feel, and `missed-session` uses red
   (`#dc2626`) for an attention-needed feel. A new template should choose
   blue/green/red/other the same way — by what the email is telling the
   recipient — not at random.

The registry completeness test in `lib/notifications/__tests__/registry.test.ts`
fails if step 2 is skipped.

## 7. Known baselines (pre-existing, not caused by this feature)

These exist in the repo independent of the email notification work. Don't
mistake them for damage from this feature when you next touch this code:

- **Tests:** `npm test` has exactly 5 pre-existing failures, none related to
  email: 3 in `actions/__tests__/admin-actions.test.ts` (`deleteUserAction`)
  and 2 in `components/dashboard/__tests__/client-dashboard-render.test.tsx`.
  Everything else passes (925/930 tests, 110/112 files, as of this task).
- **`npx tsc --noEmit`:** reports pre-existing `TS2307` errors only in
  generated `.next/` route validators (`app/account-deleted`, `app/privacy`,
  `app/terms`) — never in `app/`, `lib/`, `actions/`, or `components/`. The
  raw count is **not stable and not meaningful**: it typically runs 3 to 6
  depending on which of `.next/dev/types/` (written by `next dev`) and
  `.next/types/` (written by `next build`) happen to exist and how recently
  each was regenerated, so it will drift the next time anyone runs the dev
  server or a build. Don't try to match a specific number. The actionable,
  stable check is
  `npx tsc --noEmit 2>&1 | grep -v "\.next/"`, which must return empty
  regardless of which generated artifacts are present. If a quiet, artifact-free
  run is wanted, delete `.next/` and rebuild.
- **`npm run lint`:** roughly 310 pre-existing errors repo-wide (about 300
  `@typescript-eslint/no-explicit-any`, ~42 `no-unused-vars`, plus a handful
  of `react-hooks`/a11y rules), none introduced by this feature.
  **`no-raw-palette` — the design-system rule that forbids raw color values
  outside tokens — has zero violations repo-wide**, including in every new
  email template and settings component this feature added. When checking a
  future change, lint the changed files directly
  (`npx eslint <changed files>`) rather than running the repo-wide `npm run
  lint`, since the latter's pre-existing noise makes it useless as a gate.

## 8. Manual QA checklist

Vitest runs in Node, not a browser or an email client, so no automated test
renders a page or an email. Before enabling production sends, walk through
this by hand (after step 1's `prisma db push` — otherwise the settings page
and unsubscribe flow have nothing to read or write):

- [ ] Open `/settings/notifications` as a **trainer** — it must load, and
      the settings sub-nav must show **Notifications**, **Organization**,
      and **Audit Log**.
- [ ] Open `/settings/notifications` as a **client** — it must also load,
      and the sub-nav must show **Notifications** but *not* Organization or
      Audit Log (those are trainer-only).
- [ ] Toggle the master "Send me email notifications" switch off and confirm
      the three category switches (Sessions, Messages & check-ins,
      Nutrition) become disabled. Save, confirm the success toast, then
      reload the page and confirm the toggled state persisted.
- [ ] Confirm the Billing row always renders **checked and disabled**, with
      its "Always sent — required for account access" explanation, and that
      it cannot be turned off from this page.
- [ ] Click an unsubscribe link from a real sent email: the initial **GET**
      must show a confirmation page ("Unsubscribe from … emails?") without
      changing anything — only submitting the form (a **POST**) should apply
      the change. This matters because mail clients and security scanners
      prefetch links, and a mutating GET would unsubscribe someone who never
      clicked anything.
- [ ] Send one of each of the sixteen email templates (through Resend's
      dashboard test-send or a preview deployment) and, for each, check: the
      colored header bar, the detail rows render with real data, the CTA
      button links to the right place, and that the footer unsubscribe link
      is present on non-billing mail and absent on billing/transactional
      mail.

## Reference: the full notification list

17 notification types are registered in `lib/notifications/registry.ts`,
across four categories (sessions, messages, nutrition, billing). All 17 have
an email template — there is no `template: null` entry left in the registry.
