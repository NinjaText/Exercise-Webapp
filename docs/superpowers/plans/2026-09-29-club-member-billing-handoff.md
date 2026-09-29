# Club member billing — hand-off

Status: built, reviewed, **uncommitted** on branch `club-orgs`. Spec: `docs/superpowers/specs/2026-09-29-club-member-billing-design.md`. Plan: `docs/superpowers/plans/2026-09-29-club-member-billing.md`.

## Verification results (2026-09-30, after the final-review fix wave)

- `npx vitest run` (TZ=UTC): 183 files passed, 1 skipped; 2174 tests passed, 6 skipped, 0 failed. In a local timezone ahead of UTC (e.g. PKT), `client-dashboard-render.test.tsx` has 2 **pre-existing** date flakes between local midnight and UTC midnight: the fixture builds `new Date()` sessions and compares them to UTC-anchored calendar dates. Not caused by this feature.
- `npx tsc --noEmit`: clean.
- `npm run lint:palette`: 0 raw palette classes.
- `npx eslint` on every production file changed in the fix wave: clean. (Test files still carry `no-explicit-any` in mocks, as before.)
- `DATABASE_URL="mongodb://127.0.0.1:1/none" npx next build`: succeeds (exit 0).

## Environment variables (no `.env.example` exists in the repo)

| Var | Purpose |
| --- | --- |
| `CLUB_JOIN_SECRET` | 32+ random chars. Signs the join-code cookie. |
| `PLATFORM_STAFF_EMAIL` | Email of the TRAINER DB user that owns club program copies. |

Set both in Vercel (Production + Preview). The two new crons use the same auth as the existing crons.

## Rollout order

1. Owner runs `prisma db push` before deploy (new `OrgType`, `Organization.type/joinSlug/...`, `MemberSubscription`, `JoinCodeAttempt`).
2. Set `CLUB_JOIN_SECRET` and `PLATFORM_STAFF_EMAIL` in Vercel (Production + Preview).
3. Make sure the staff TRAINER user exists (sign up normally, finish trainer onboarding; its own trainer org is fine).
4. Confirm the Clerk plan allows `maxAllowedMemberships: 0` (unlimited) or a big enough cap.
5. Create a Stripe product + recurring price per club.
6. Author the starter programs in `/admin/global-programs` (Global, Scheduled — not On-Demand).
7. Deploy (adds crons `/api/cron/club-starter-programs` every 15 min and `/api/cron/member-trial-reminders` daily 15:00 UTC).
8. Create the club in `/admin/clubs/new`.

## Manual E2E in Stripe test mode

1. Create a club in `/admin/clubs/new`.
2. Open `/join/<slug>` in a private window.
3. Enter a wrong code twice: both give the same generic error.
4. Enter the right code, sign up, land in onboarding.
5. The dashboard shows the trial banner. Inbox is gone from the sidebar and the mobile tab bar.
6. `/messages` (and `/check-ins`) redirect to the dashboard.
7. The starter program appears within about 1 minute (or when the 15-min cron runs).
8. Set `trialEndsAt` to yesterday in the test DB. Any page redirects to `/billing?reason=trial_expired`.
9. Subscribe with test card `4242 4242 4242 4242`. `/billing/success` confirms; back in the app there is no banner.
9a. Subscribe **during** a trial with more than 2 days left: Stripe shows a trial until the original `trialEndsAt`, no charge today. `/billing` shows "starts automatically when it ends", has no Subscribe button, and trial-reminder emails stop.
10. Cancel in "Manage billing". At period end (or via a Stripe test clock) access is blocked.
11. Subscribe again: the same Stripe customer is reused.

## Trainer regression spot check

- An existing trainer account: same gate outcomes (trial expired, canceled, payment failed redirects), nav unchanged, trainer checkout/portal unchanged.
- An invited client: accepts invite, completes `/onboarding/client`, `clerkOrgId` is set, program assignment applies as before.

## Decisions made during implementation (owner should know)

1. `Organization.joinSlug` and `MemberSubscription.stripeCustomerId` are NOT `@unique`. MongoDB unique indexes on optional fields collide on null and would break `db push` for existing orgs. Slug uniqueness is enforced in `club.service` (`assertSlugFree`); `@@index` was added.
2. Starter assignment uses an atomic claim. `starterStatus` is `PENDING | ASSIGNING | ASSIGNED | FAILED`; stale claims older than 10 minutes are retried by the 15-minute cron.
3. Member webhook writes are scoped to the member's current Stripe subscription id. PAST_DUE/UNPAID members are sent to "Manage billing" instead of a second checkout.
4. `/api/stripe/status` now also answers for CLIENTs (member subscription) so `/billing/success` works for members.
5. `completeClientOnboarding` no longer nulls `clerkOrgId` when the session has no active org (pre-existing bug that would detach club members).
6. Club program copies are owned by the `PLATFORM_STAFF_EMAIL` user, who is not added to club Clerk orgs (the membership webhook would overwrite its `clerkOrgId`); `createOrganization` is called without `createdBy`.
7. Clubs are created with `brandingEnabled: true`. With no logo or colour set, `resolveBranding` keeps the product look and shows the club name on `/join`, `/billing` and trial emails. Clubs created before this change have `brandingEnabled: false`; flip it in the DB if any exist.
8. New capability `coachNotifications` (TRAINER true, CLUB false). With it off, client activity doesn't notify anyone: workout completed, exercise notes, nutrition replies, check-in submissions. Club programs belong to the staff account, which would otherwise get every member's workouts. `messaging` is now also enforced in server actions: `sendMessageAction`, `replyToClientNoteAction`, `sendBroadcastMessageAction`, voice messages (presign + confirm) and workout voice notes (presign + confirm). They return "Messaging isn't available for your account." The member dashboard hides the Inbox card and trainer banner and skips the inbox query.
9. The starter sweep has a 240 s time budget (`maxDuration` is 300). After that it starts no new batches and returns `stoppedEarly: true`. Members it didn't reach are picked up on the next run, oldest first. Trials that have ended are no longer swept (ACTIVE members still are).
10. Subscribing early keeps the rest of the trial. If a TRIALING member's trial has more than 48 h left (Stripe's minimum), checkout sets `subscription_data.trial_end = trialEndsAt`. That member then has status TRIALING with a `stripeSubscriptionId`, and every member surface treats it as "subscribed": checkout refuses a second subscription (409), `/billing` has no Subscribe button, the trial banner and reminder emails stop, and the member gate lets them in past `trialEndsAt` until Stripe's trial-conversion webhook turns them ACTIVE or PAST_DUE. The trainer `evaluateAccess` rule is unchanged.
11. Admin stats: "Trialing" now counts only trials that haven't ended. Ended trials that are still TRIALING show as "Trial ended" and count as decided but not paying, so conversion is no longer inflated.
12. Smaller fixes. The enrollment upsert recovers from a P2002 race with the Clerk webhook. Member Stripe `incomplete_expired` maps to CANCELED and `paused` to UNPAID (trainer mapping unchanged). Join slugs are matched case-insensitively, and so is the join rate-limit key. `/billing` creates a missing member trial row. The admin club page says "Showing the first 200 members" when the list is capped.

## Known follow-ups

- Club logo/colour editor in admin. The existing editor is bound to the current user's org; clubs show their name only.
- MRR column on `/admin/clubs`.
- Empty state for a member who has completed every starter program (today they just see "Nothing scheduled").
- Trial-reminder copy for short trials (1–3 day trials fall straight into the reminder window).
- `JoinCodeAttempt` retention cleanup.
- Member count on the admin club page is still capped at 200 rows (now labelled); add paging if clubs get large.
- Club-facing reporting; card-up-front option; email allowlist.
