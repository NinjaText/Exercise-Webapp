# Club member billing — hand-off

Status: built, reviewed, **uncommitted** on branch `club-orgs`. Specs: `docs/superpowers/specs/2026-09-29-club-member-billing-design.md` and `docs/superpowers/specs/2026-10-01-club-trainer-and-coaching-design.md` (club trainer + paid coaching add-on, built on top). Plan: `docs/superpowers/plans/2026-09-29-club-member-billing.md`.

## Verification results (2026-10-01, after the club trainer + coaching build, its fix rounds and the final-review fix wave)

- `TZ=UTC npx vitest run`: 210 files passed, 1 skipped; 2814 tests passed, 6 skipped, 0 failed. In a local timezone ahead of UTC (e.g. PKT), `client-dashboard-render.test.tsx` has 2 **pre-existing** date flakes between local midnight and UTC midnight: the fixture builds `new Date()` sessions and compares them to UTC-anchored calendar dates. Not caused by this feature.
- `npx tsc --noEmit`: clean.
- `npm run lint:palette`: 0 raw palette classes.
- `npx eslint` on the changed production files: clean, except 5 `no-explicit-any` errors in `actions/workout-actions.ts` (lines ~285-319) and `actions/calendar-workout-actions.ts` (~1243), in code this work did not touch.
- `DATABASE_URL="mongodb://127.0.0.1:1/none" npx next build`: succeeds (EXIT=0).

## Environment variables

No new environment variables are needed. `CLUB_JOIN_SECRET` and `PLATFORM_STAFF_EMAIL` (used by the first club build) are **gone**: the join-cookie key is now derived from the existing `CLERK_SECRET_KEY`, and member program copies are owned by each club's own trainer. Delete both from Vercel if you already set them. The two crons use the same auth as the existing crons.

## Rollout order

1. Owner runs `prisma db push` before deploy (new `OrgType`, `Organization.type/joinSlug/coachingStripePriceId/...`, `MemberSubscription`, `MemberCoaching`, `JoinCodeAttempt`). All new fields are optional.
2. Owner runs `npm run db:backfill-club-null-fields` (dry run: prints, per field, how many `MemberSubscription`/`MemberCoaching` docs are missing optional fields such as `stripeSubscriptionId`), then `npm run db:backfill-club-null-fields -- --apply` to write explicit nulls. Run it after `db push` and before the crons are on (step 7). On MongoDB a Prisma `{ field: null }` filter skips docs where the field was never written. New rows now store explicit nulls and the queries also match unset fields (`lib/db/mongo-null.ts`), so this step only cleans up existing data. It is idempotent and safe to re-run.
3. Confirm the Clerk plan allows `maxAllowedMemberships: 0` (unlimited) or a big enough cap, and that Clerk organization invitations are enabled.
4. Nothing to create in Stripe by hand: enter the amounts in the club form (**Membership price ($/month)**, required, $1 to $10,000; **Coaching price ($/month)**, optional, empty = coaching not offered). Saving creates a Stripe product + USD monthly price per club (product names "<Club> — Membership" / "<Club> — Coaching", metadata `app: club`). They are created in whichever Stripe mode `STRIPE_SECRET_KEY` is in (test key = test-mode prices, live key = live prices), so a club made against test keys must be re-priced after switching to live (its test price reads as "couldn't load"; type the amount again and save). Changing an amount creates a new price on the same product and archives the old one (never deleted); existing subscribers stay on the price they started on. Clearing the coaching amount stops offering coaching to new requests. Clubs that had manually pasted price ids keep them until an amount is changed; the edit form shows a non-USD/non-monthly or unreadable price as an empty field with a note, and empty then means "keep it".
5. Author the starter programs: Global, Scheduled (not On-Demand) in `/admin/global-programs`; or let the club trainer author their own templates and add them to the club afterwards.
6. Decide the **dedicated email for each club trainer**. It must not already belong to an app user (one person, one org). If a club existed before this change, see "Clubs created before the trainer change" below.
7. Deploy (crons `/api/cron/club-starter-programs` every 15 min and `/api/cron/member-trial-reminders` daily 15:00 UTC). The Stripe webhook must also deliver the events it already receives for coaching subscriptions (same endpoint).
8. Create the club in `/admin/clubs/new` with the trainer email. The trainer gets a Clerk invitation. **The club stays closed (`/join/<slug>` says "This club isn't open yet") until the trainer accepts the invitation.** The club opens as soon as the trainer's account exists (`getClubTrainer` matches any TRAINER row), even before they finish the name-only onboarding.
9. Share the join link and access code only after the club trainer shows as Active on `/admin/clubs`.

### Clubs created before the trainer change

A club from the first build has no trainer and its member programs are owned by the old staff account. Open it in `/admin/clubs/<id>`, use **Invite trainer** with a dedicated email; on accept, members' programs and the club's non-global starter templates transfer to the trainer. Until then the club reads as not open.

**Warning:** on such a club, check the phase-1 staff TRAINER row (the old `PLATFORM_STAFF_EMAIL` account) first. If its `clerkOrgId` was set to the club, the app counts it as the club's trainer, and **Replace trainer** would deactivate that shared staff account. Clear its `clerkOrgId` (or use Invite trainer, never Replace) before onboarding the real trainer.

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

### Club trainer (Stripe test mode not required)

1. Create a club with a fresh trainer email. `/admin/clubs` shows Trainer "Invite pending"; `/join/<slug>` shows "This club isn't open yet".
2. Accept the invitation from the email in a private window. `/join/<slug>` now works (the club opens on accept). Then finish `/onboarding/club-trainer` (name only). No trainer billing page, no trial banner. Settings has Branding.
3. `/admin/clubs` shows the trainer as Active.
4. Admin: on the club page use Resend invite (pending only) and Replace trainer (new, unused email). The old trainer is removed from the club and their account is deactivated (they are redirected to /account-deactivated and program actions refuse them); their members' programs and starter templates move to the new trainer once the new one accepts.
5. Negative: an email that already has an account is refused at create and at replace.

### Coaching: request, accept, pay, inbox, cancel (Stripe test mode)

1. Club has a Coaching price. As a member (not coached) open the dashboard: Coaching card offers a request with a note. Inbox and `/messages` stay unavailable.
2. Request coaching. The trainer sees it (Coaching badge "Coaching requested") and accepts (or declines with a note: member can re-request).
3. Member's coaching card shows "Accepted" with a **Start coaching** button ("Awaiting payment" is the trainer's badge for the same state). The member pays via the coaching checkout with `4242 4242 4242 4242` (works during the membership trial; charged immediately). Opening checkout twice expires the first session, so only one can be paid.
4. After the webhook: status ACTIVE, Inbox/check-ins/voice notes appear for that member only, the trainer can message them and assign check-ins, coach notifications start.
5. Check `MemberSubscription` is unchanged by the coaching payment (coaching events never touch it).
6. Cancel in the member portal: coaching ends at period end; or the trainer ends it (cancel at period end), or withdraws an accepted-but-unpaid offer. Membership cancel ends coaching immediately.
7. Fail the coaching payment (test card `4000 0000 0000 0341` on renewal): PAST_DUE pauses coaching; fixing the payment resumes it.

## Trainer regression spot check

- An existing trainer account: same gate outcomes (trial expired, canceled, payment failed redirects), nav unchanged, trainer checkout/portal unchanged, messaging unchanged.
- An invited client: accepts invite, completes `/onboarding/client`, `clerkOrgId` is set, program assignment applies as before.
- Trainer-org clients (not club members) never see coaching UI.

## Club trainer and coaching decisions (D1-D15, 2026-10-01)

D1 Join-cookie key derived from `CLERK_SECRET_KEY`; access code unchanged. D2 New club requires a trainer email; Clerk invitation with `org:admin` and `invitedRole=TRAINER`. D3 Acceptor becomes a TRAINER in that club org, name-only onboarding, no trainer billing or trial. D4 One person, one org; the trainer email must not be an existing app user. D5 Club opens only once its trainer has accepted. D6 Member program copies are owned by the club trainer (`getClubTrainer`). D7 Starters: Global Programs or the club trainer's templates, both Scheduled. D8 Admin can resend a pending invite and replace the trainer; ownership of member programs and the old trainer's starter templates transfers. D9 Club trainer uses the existing branding editor, never sees trainer Billing. D10 Coaching is a paid add-on with an optional per-club Coaching price. D11 Request with note, trainer accepts or declines, member pays, ACTIVE on payment. D12 Coaching is a separate Stripe subscription on the member's existing customer; allowed during the trial, charged immediately. D13 Coaching on means messaging, check-ins, coach notifications for that member only. D14 Member cancels in the portal; trainer can end (period end) or withdraw an unpaid offer; membership ending cancels coaching at once; failed payment is PAST_DUE and pauses coaching. D15 All capability decisions stay in `lib/org-capabilities.ts`, which now takes role and coaching state.

## Decisions made during implementation (owner should know)

1. `Organization.joinSlug` and `MemberSubscription.stripeCustomerId` are NOT `@unique`. MongoDB unique indexes on optional fields collide on null and would break `db push` for existing orgs. Slug uniqueness is enforced in `club.service` (`assertSlugFree`); `@@index` was added.
2. Starter assignment uses an atomic claim. `starterStatus` is `PENDING | ASSIGNING | ASSIGNED | FAILED`; stale claims older than 10 minutes are retried by the 15-minute cron.
3. Member webhook writes are scoped to the member's current Stripe subscription id. PAST_DUE/UNPAID members are sent to "Manage billing" instead of a second checkout.
4. `/api/stripe/status` now also answers for CLIENTs (member subscription) so `/billing/success` works for members.
5. `completeClientOnboarding` no longer nulls `clerkOrgId` when the session has no active org (pre-existing bug that would detach club members).
6. (Superseded 2026-10-01) Club program copies were first owned by a `PLATFORM_STAFF_EMAIL` staff account. They are now owned by each club's own trainer (D6); the staff-account env var no longer exists.
7. Clubs are created with `brandingEnabled: true`. With no logo or colour set, `resolveBranding` keeps the product look and shows the club name on `/join`, `/billing` and trial emails. Clubs created before this change have `brandingEnabled: false`; flip it in the DB if any exist.
8. New capability `coachNotifications` (TRAINER true, CLUB false). With it off, client activity doesn't notify anyone: workout completed, exercise notes, nutrition replies, check-in submissions. Club programs belong to the club trainer (originally a platform staff account, since replaced by D6), who would otherwise get every member's workouts; uncoached members have no coach to page. `messaging` is now also enforced in server actions: `sendMessageAction`, `replyToClientNoteAction`, `sendBroadcastMessageAction`, voice messages (presign + confirm) and workout voice notes (presign + confirm). They return "Messaging isn't available for your account." The member dashboard hides the Inbox card and trainer banner and skips the inbox query.
9. The starter sweep has a 240 s time budget (`maxDuration` is 300). After that it starts no new batches and returns `stoppedEarly: true`. Members it didn't reach are picked up on the next run, oldest first. Trials that have ended are no longer swept (ACTIVE members still are).
10. Subscribing early keeps the rest of the trial. If a TRIALING member's trial has more than 48 h left (Stripe's minimum), checkout sets `subscription_data.trial_end = trialEndsAt`. That member then has status TRIALING with a `stripeSubscriptionId`, and every member surface treats it as "subscribed": checkout refuses a second subscription (409), `/billing` has no Subscribe button, the trial banner and reminder emails stop, and the member gate lets them in past `trialEndsAt` until Stripe's trial-conversion webhook turns them ACTIVE or PAST_DUE. The trainer `evaluateAccess` rule is unchanged.
11. Admin stats: "Trialing" now counts only trials that haven't ended. Ended trials that are still TRIALING show as "Trial ended" and count as decided but not paying, so conversion is no longer inflated.
12. Smaller fixes. The enrollment upsert recovers from a P2002 race with the Clerk webhook. Member Stripe `incomplete_expired` maps to CANCELED and `paused` to UNPAID (trainer mapping unchanged). Join slugs are matched case-insensitively, and so is the join rate-limit key. `/billing` creates a missing member trial row. The admin club page says "Showing the first 200 members" when the list is capped.

13. Final-review fixes (2026-10-01). **Account deletion** (self-delete, super-admin delete and the Clerk `user.deleted` webhook) now cancels a club member's membership subscription and any ACTIVE/PAST_DUE coaching subscription in Stripe *before* anything is deleted ("already cancelled" counts as success; any other Stripe failure aborts with nothing deleted; the webhook returns 500 so Svix retries), then expires their open Checkout sessions and deletes the `MemberCoaching` and `MemberSubscription` rows (they never block deletion). **No-card trial expiry**: the daily `/api/cron/member-trial-reminders` also ends open coaching for members whose trial ran out with no subscription (no Stripe event fires for that); daily was chosen over the 15-min cron because it is a trial-end rule and coaching bills monthly, so the lag can't add a charge except a renewal inside that window. **Open coaching checkouts** are expired before a new one is created, and when an offer is withdrawn/ended or coaching is cancelled because the membership ended. **Orphaned coaching subscriptions** created in the last 24 h are cancelled *and* their paid first invoice is refunded (idempotent per subscription); older orphans are only cancelled. Deactivating a club member ends their coaching (best-effort). Club members' messages and voice notes/memos must pass the same-org pair rule (trainer-org clients unchanged). Coaching checkout refuses deactivated accounts and an offer from another club.

## Known follow-ups

- Resolved: club logo/colour editor. The club trainer uses the existing Branding settings for their org (D9).
- Coaching: orphaned coaching subscriptions are refunded automatically only within 24 h of creation; an older orphan is cancelled without a refund (refund manually in Stripe if needed).
- Coaching: withdrawing an offer or ending coaching sends no notification to the counterpart.
- Coaching emails follow the member's/trainer's "messages" email preference, so someone who turned that off gets no coaching emails.
- Membership keeps billing when a trainer deactivates a member (only their coaching is cancelled). Cancel the membership in Stripe, or have the member cancel in the portal, if that's wanted.
- MRR column on `/admin/clubs` (the list now has Trainer and Coached columns).
- Empty state for a member who has completed every starter program (today they just see "Nothing scheduled").
- Trial-reminder copy for short trials (1–3 day trials fall straight into the reminder window).
- `JoinCodeAttempt` retention cleanup.
- Member count on the admin club page is still capped at 200 rows (now labelled); add paging if clubs get large.
- Club-facing reporting; card-up-front option; email allowlist.
