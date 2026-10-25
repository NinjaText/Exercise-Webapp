# Follow-Along Videos, Daily Reflections, Trainer Payments — Design

Source: client request doc "Follow along videos, Reflections, Payment" (2026-10-21) plus 3 mockups
(client follow-along flow, trainer "Create Reflection" stepper, client dashboard with Today's
Reflection). Mockups are directional, not pixel specs. The user skipped Q&A; every decision below not
quoted from the doc is our call and is marked **(call)**.

Three independent features, built in parallel on shared groundwork that is already in place.

## 0. Shared groundwork (DONE — do not redo)

- `prisma/schema.prisma`: all new fields/models below are already added and `prisma generate` has run.
  **Never run `prisma db push` or any script against the database — `DATABASE_URL` is production.**
  The user pushes the schema themselves.
- Message context: `Message.contextKind | contextRefId | contextTitle | contextExcerpt`
  (`"REFLECTION" | "WORKOUT_FEEDBACK"`). `messageService.sendMessage({ ..., context })` stores it;
  the thread renders a quote card; `getMessageCategory` maps REFLECTION→"reflection",
  WORKOUT_FEEDBACK→"workout"; the dashboard Inbox card has a "Reflection" chip.
- `lib/services/context-message.service.ts` → `sendContextMessageToTrainer({ client, trainerId,
  content, context })`: persists, Pusher-broadcasts, notifies the trainer (in-app + email). Callers
  authorize first (trainer via `getTrainerForClient`, client must have `caps.messaging`).
- Nav (`components/layout/nav-items.ts`): trainer `/reflections`, `/payments`; client `/journal`,
  `/store`. `/payments` + `/store` are hidden for club orgs (`hiddenNavHrefs`, billing === "member").
- Audit actions added to `lib/audit/catalog.ts` (REFLECTION_*, WORKOUT_FEEDBACK_SUBMITTED,
  PAYMENT_ACCOUNT_*, OFFER_*). Use `logUserAudit`.

Conventions to follow (see existing code): server actions in `actions/*-actions.ts` returning
`{ success, data | error }`; business logic in `lib/services/*.service.ts`; zod in `lib/validators/`;
UI primitives in `components/ui` + `components/shared` (`PageShell`, `PageHeader`, `SectionCard`,
`EmptyState`, `StatusBadge`); design tokens only (the lint rule bans raw palette classes); vitest
tests beside existing ones with inline `vi.mock("@/lib/prisma")`. No git commits.

---

## 1. Follow-along video programs

**Doc:** trainers add follow-along videos (e.g. 15-min videos the client plays and follows) instead of
building exercise-by-exercise; schedule a program of N days (e.g. 90) with one video per day; client
clicks "Start session", watches on a screen that opens, with a countdown timer at the top and
stop/play; at the end a popup asks how it went.

**Data**
- `Program.contentFormat = "FOLLOW_ALONG"` marks the program (null → normal). Read through a helper
  `isFollowAlongProgram()` in `lib/utils/follow-along.ts`.
- `Workout.videoUrl`, `Workout.videoDurationSec`; trainer notes go in the existing
  `Workout.description`; title in `Workout.name`. A video workout has **zero blocks**.
- Day N (1-based) ↔ `weekIndex = floor((N-1)/7)`, `dayIndex = (N-1) % 7`,
  `orderIndex = weekIndex*7 + dayIndex` (existing caps: dayIndex 0..6, weekIndex 0..103 → max 728
  days). **(call)** Max 365 days per follow-along program.
- Rest days = days with no workout row. **(call)**
- `WorkoutSessionV2.feelingRating` (HARD | CHALLENGING | JUST_RIGHT | EASY | GREAT, labels "Hard",
  "Challenging", "Just right", "Easy", "Great"), `watchedSeconds`; comment → `overallNotes`.
- Everything that copies workouts (`mapWorkoutsForCopy`, `insertWorkoutTree`, `duplicateProgram`,
  `syncProgramToTemplate`, `getProgramById` selects, calendar ad-hoc copies) must carry
  `videoUrl`/`videoDurationSec` and `contentFormat`, or assigning a template silently drops videos.

**Video sources (call):** upload to R2 (mp4/webm/mov, ≤ 2 GB, presigned PUT with `ContentLength`
bound, key `follow-along/{trainerId}/{uuid}.{ext}`, upload progress bar) **or** paste a YouTube URL.
Duration auto-read from the file's metadata on upload; for YouTube read it from the IFrame player
once loaded, with a manual minutes field as fallback.

**Trainer flow**
- `CreateProgramMenu` gets "Follow-along videos". It opens a dedicated editor (new route, e.g.
  `/programs/new/follow-along`; `/programs/[id]/edit` routes follow-along programs to it).
- Editor: name, description, number of days, optional start date, per-day rows (title, video
  upload/URL, duration, notes, rest-day toggle). Helpers: "copy previous day", auto-title
  "Day N". Saves through the existing create/update program actions; validators accept a
  zero-block workout only when it has a `videoUrl`.
- Scheduling on the calendar = the existing Assign flow (start date → one session per day). No new
  scheduling engine. Program detail / schedule views and the trainer calendar must render video days
  sensibly (video badge, duration) instead of "0 exercises", and must not crash on zero blocks.
- Trainer sees the client's rating + comment wherever session RPE/notes already show (session detail
  page, calendar workout panel).

**Client flow**
- `/sessions/[id]`: when the workout has a `videoUrl`, render the follow-along experience instead of
  `WorkoutModeWrapper`. Pre-screen: "Day 12 of 90" + progress bar, video poster, title, duration,
  trainer notes, **Start session** (→ `startSessionV2Action`).
- Player screen (full-screen overlay; native fullscreen optional): top bar with title + **countdown**
  (remaining = duration − current time), **play/pause**, **stop** (confirm → ends early). Both
  sources go through one player abstraction (HTML5 `<video>` ref; YouTube IFrame API).
- On video end or stop → **"How did it go?"** dialog: 5 faces, optional comment (≤ 500 chars),
  "Send to trainer" / "Skip". Completes the session (status, completedAt, durationMinutes,
  watchedSeconds, feelingRating, overallNotes, scheduleVariance, audit, trainer completion
  notification — reuse `completeSessionV2Action` internals, don't fork them). If a comment was
  written and the client has messaging, also `sendContextMessageToTrainer` with
  `WORKOUT_FEEDBACK` context (title = workout name, excerpt = "Felt: Just right · Day 12 of 90").
- Dashboard Up Next, calendars, week strip: video workouts show "Follow-along · 15 min" (and "Day N
  of M" where cheap) instead of an exercise count; CTA "Start session".

---

## 2. Daily reflections + journal

**Doc:** "Today's Reflection" on the client dashboard **below the upcoming workout and above
Resources and Inbox**: a daily quote, question or prompt with three options — Reflect on my own
(nothing submitted), Journal on my own (private, client-only), Share with my trainer (goes to the
trainer's inbox, trainer can reply). A Journal tab in client nav. Trainers create, select and
schedule prompts via (1) AI, (2) manual entry for the program's days, (3) a filterable list.

**Data**
- `Reflection`: one target — `clientId + date` (UTC midnight, matching the app's UTC-anchored
  dates) **or** `programId + dayIndex` (0-based from program start). `kind` QUOTE | QUESTION |
  PROMPT, `text`, `author`, `guidance`, `theme`, `imageUrl`, `source` CUSTOM | AI | LIBRARY,
  `allowJournal`, `allowShare`.
- Program reflections are stored against the trainer's program (normally the template). A client's
  copy resolves them through `programId ∈ {program.id, program.sourceTemplateId}` (assign always
  duplicates and sets `sourceTemplateId`), so editing the template's plan updates every client.
  **(call)**
- `JournalEntry`: `visibility` PRIVATE | SHARED, prompt snapshot, `body`, `entryDate`,
  `messageId` for SHARED. **PRIVATE entries are never returned on any trainer path** — enforce in
  the service and test it.

**Today's reflection resolution (client)** — first match wins:
1. a `Reflection` for this client dated today;
2. a program reflection for an ACTIVE SCHEDULED program with a startDate: dayIndex = days since start;
3. **(call)** fallback: a built-in library entry rotated by date, so the card is never empty.

**Built-in library** `lib/reflections/library.ts` (**call**): ~60 entries across themes
(Consistency, Mindset, Recovery, Gratitude, Discipline, Self-care, Progress, Motivation), each
{ id, kind, text, author?, theme }. Prefer original, unattributed prompts/questions; only include a
quote with an author when the attribution is well established (avoid famous misattributions).

**AI generation** (`generateObject` + zod, same model/pattern as
`lib/services/nutrition-ai.service.ts`): inputs theme, tone, kind, optional audience/program
context, count. Single mode returns 3 options (Use this / Regenerate, per mockup). Program-plan mode
fills N days (chunks of ≤ 30 per call, cap 120 days per request). Cap all input lengths.

**Trainer UI** — `/reflections` (nav already added):
- **Create reflection** stepper per mockup: method (Write your own | Generate with AI | Prompt
  library with theme/kind filters + search) → review/edit (text, author, guidance, optional image
  upload to R2, allow journal / allow share toggles) → schedule (All clients | specific clients ×
  single day | recurring weekdays with start/end ≤ 180 days; **or** a program + day number) →
  preview (client card) → save. Fan-out creates one row per client/date; cap 2,000 rows per save.
- **Program plans**: pick a program → list of days 1..N (from its workouts span or durationWeeks×7)
  with each day's reflection; per-day write/edit/pick-from-library/delete; "Fill empty days with AI".
- **Scheduled**: upcoming client-dated reflections, edit/delete.
- Trainer client detail page gets a **Reflections** tab: upcoming reflections for that client and
  the entries they shared (link to thread). Never private ones.

**Client UI**
- Dashboard card (between Up Next and Resources/Inbox): image or tokenised gradient, kind label,
  text, author; three option tiles. Reflect → calm "take a moment" state, nothing saved. Journal →
  inline editor, saves PRIVATE. Share → editor, saves SHARED and calls
  `sendContextMessageToTrainer` (context REFLECTION, title "Today's reflection", excerpt = prompt).
  Hide Journal/Share when the reflection disallows them; hide Share when the client lacks
  `caps.messaging` or has no trainer. Show "Journaled today ✓" state if an entry exists today.
- `/journal`: entries newest first (badge Private / Shared with trainer), new free-form entry,
  edit/delete PRIVATE entries; SHARED entries are read-only (already sent).

---

## 3. Trainer payments — Stripe Connect

**Doc:** trainers charge clients in-app (Square was mentioned; **call**: Stripe only — the doc's
detailed spec is Stripe Connect, and it already powers MIA billing). Requirements: onboarding
(connect existing or create via MIA); one-time program price; monthly coaching memberships; Stripe
Checkout; automatic access after confirmed payment; trainer view of completed payments, active
subscriptions, failed payments, payouts; client subscription management with access ending per the
cancellation policy; no MIA commission; direct charges + Stripe-managed pricing; webhooks sync
payments, subscriptions, refunds, access; keep MIA's own billing separate.

**Accounts**
- Create: `stripe.accounts.create({ controller: { stripe_dashboard: { type: "full" }, fees: {
  payer: "account" }, losses: { payments: "stripe" }, requirement_collection: "stripe" } })` +
  Account Link onboarding (refresh/return URLs under `/payments`). On onboarding a trainer can sign
  in with an existing Stripe login.
- Connect existing: Standard OAuth (`connect.stripe.com/oauth/authorize`, `stripe.oauth.token`) —
  enabled only when `STRIPE_CONNECT_CLIENT_ID` is set; the button is hidden otherwise. `state`
  must be a signed/verified value bound to the trainer (CSRF).
- `ConnectedAccount` mirrors charges/payouts/details flags; refreshed on `account.updated` and on
  return from onboarding. `account.application.deauthorized` → `disconnectedAt`, deactivate offers.
- Verify exact Stripe SDK v22 types in `node_modules/stripe` — do not rely on memory.

**Offers** (`PaidOffer`): PROGRAM (one-time, linked `programTemplateId`, required) or COACHING
(monthly recurring, optional program assigned at start, `cancellationPolicy` END_OF_PERIOD |
IMMEDIATE). Product + Price created **on the connected account** (`{ stripeAccount }`). Price edits
create a new Price and deactivate the old (prices are immutable); archiving sets `isActive=false`
and archives the Stripe product. Only trainers with `chargesEnabled` can publish.

**Checkout (client)** — `/store` (client nav): offers from the client's own trainer(s)
(`getTrainersForClient`) with charges enabled; buy / subscribe → server creates a Checkout Session
**on the connected account** (direct charge, no `application_fee_amount`; a single
`PLATFORM_FEE_BPS = 0` constant documents the "no commission" decision), `customer_email` = client
email, metadata `{ purchaseType: "connect_offer", offerId, clientId, trainerId }` on the session and
`subscription_data`/`payment_intent_data`. PROGRAM: an `OfferPurchase` PENDING row is created
before redirect, keyed by session id. Block duplicate active coaching subs to the same offer.
Success/cancel pages under `/store`.

**Webhook** — new route `app/api/stripe/connect/webhook/route.ts` with
`STRIPE_CONNECT_WEBHOOK_SECRET` (a Connect endpoint; events carry `event.account`). Public route
(add to `lib/auth/public-routes.ts`). Never mix with `/api/stripe/webhook`. Events:
`checkout.session.completed` / `async_payment_succeeded` / `async_payment_failed`,
`customer.subscription.updated` / `deleted`, `invoice.paid`, `invoice.payment_failed`,
`charge.refunded`, `account.updated`, `account.application.deauthorized`. Every handler idempotent
(status guards, unique ids); always look up the account-scoped object with `{ stripeAccount:
event.account }`; only act on metadata.purchaseType === "connect_offer".

**Access**
- PROGRAM paid → `duplicateProgram(template, trainerId)` then `assignProgram(copy, clientId, today)`
  (or `assignOnDemandProgram` for Resource templates) inside `after()`; `fulfillmentStatus`
  FULFILLED/FAILED; a cron retries FAILED/stale PENDING (extend the existing
  `retry-program-purchases` cron or add one in `vercel.json`). Full refund → REFUNDED + pause the
  assigned program.
- COACHING active → `OfferSubscription` ACTIVE (+ assign its program if any). PAST_DUE on failed
  invoice (notify client + trainer). Canceled/deleted → CANCELED + pause its assigned program.
- Client cancel: END_OF_PERIOD → `cancel_at_period_end: true` (resumable until then);
  IMMEDIATE → cancel now. Client sees status, renewal/end date, cancel/resume.

**Trainer `/payments`** (nav already added): Connect status card (start/continue onboarding,
requirements due, link to dashboard.stripe.com); **Offers** (create/edit/archive); **Payments**
(live `charges.list` on the connected account: succeeded/failed/refunded, client, amount, date);
**Subscriptions** (DB rows + client names + status); **Payouts** (`balance.retrieve` +
`payouts.list`). Stripe API calls are read live with small limits and fail soft with an inline
error.

**Notifications (call):** in-app notifications for trainer "payment received" and client/trainer
"payment failed" via `notifyUser` (registry entries in `billing` category).

**Env:** `STRIPE_CONNECT_WEBHOOK_SECRET` (required), `STRIPE_CONNECT_CLIENT_ID` (optional, enables
"connect existing account"). Document in the handoff.

---

## Out of scope / deferred
- Square integration (call: not built).
- Platform commission (fee constant is 0).
- Native app (Capacitor) specifics beyond the web UI working on phones.
- Video transcoding/HLS — files are served as uploaded from R2.
