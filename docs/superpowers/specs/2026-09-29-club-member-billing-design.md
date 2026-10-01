# Club Orgs & Member-Pays Billing — Design

**Date:** 2026-09-29
**Status:** Approved in brainstorm, pending written-spec review

## 1. Goal

Support a second customer type alongside today's trainer businesses:

| | Trainer org (existing) | Club org (new) |
|---|---|---|
| Who manages clients | The trainer | Us (platform staff) |
| Programs | Trainer builds per client | Default "starter" programs, auto-assigned on join |
| Who pays | Trainer (`TrainerSubscription`) | Each member (`MemberSubscription`) |
| Trial | Trainer trial, no card | Member trial, no card, per-club length |
| Coaching | Full (messaging, check-ins, notes) | Self-guided — coaching features hidden |
| How clients arrive | Trainer invites by email | Member self-joins via club link + access code |

Success: a super admin can create a club, share a link + code, members join and immediately get programs, trial expiry blocks access, members subscribe via Stripe and regain access — with zero change in behavior for existing trainer orgs.

## 2. Decisions (locked in brainstorm)

1. **Reuse the trainer/client system.** A club is a Clerk org like any trainer org; a platform staff account is a TRAINER member of every club org and owns its programs. Members are CLIENT users.
2. **Self-guided.** Members get programs, sessions, progress, habits, nutrition. Messaging, voice notes, check-ins, clinical notes are hidden.
3. **No-card trial.** Trial is a DB date; the app gates access after expiry until the member pays (same pattern as trainers).
4. **Org type is set only by super admin.** Trainer signup always creates `TRAINER` orgs. Clubs are created in `/admin/clubs`. Type is changeable only while the org has zero CLIENT users.
5. **Per-club pricing.** Each club stores its own `trialDays` and `stripePriceId`.
6. **Join = link + access code.** `/join/<joinSlug>` requires the club's current `joinCode`.

## 3. Data model

### `Organization` (extend)

```prisma
enum OrgType {
  TRAINER
  CLUB
}

model Organization {
  // ...existing fields...
  type              OrgType  @default(TRAINER)
  // Club-only (null for TRAINER orgs)
  joinSlug          String?  @unique
  joinCode          String?
  trialDays         Int?
  stripePriceId     String?
  starterProgramIds String[] @db.ObjectId   // ordered program templates
}
```

### `MemberSubscription` (new — mirrors `TrainerSubscription`)

```prisma
model MemberSubscription {
  id                   String    @id @default(auto()) @map("_id") @db.ObjectId
  userId               String    @unique @db.ObjectId
  user                 User      @relation("MemberSubscription", fields: [userId], references: [id])
  clerkOrgId           String
  status               SubStatus @default(TRIALING)
  trialEndsAt          DateTime
  stripeCustomerId     String?   @unique
  stripeSubscriptionId String?
  currentPeriodEnd     DateTime?
  cancelAtPeriodEnd    Boolean   @default(false)
  remindersSent        String[]  // "d3" | "d1" | "d0" — idempotency for trial emails
  starterStatus        String    @default("PENDING") // PENDING | ASSIGNED | FAILED
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt

  @@index([clerkOrgId, status])
  @@index([status, trialEndsAt])
}
```

`User` gets the back-relation `memberSubscription MemberSubscription? @relation("MemberSubscription")`.

## 4. Units

### 4.1 `lib/org-capabilities.ts`
`getOrgCapabilities(org: { type: OrgType } | null)` →
`{ billing: "trainer" | "member", messaging, voiceNotes, checkIns, clinicalNotes }` (booleans).
`null` org / `TRAINER` → today's full capability set with `billing: "trainer"`. This is the **only** place that branches on `OrgType`; sidebar, route guards, billing gate and webhooks read from it.

### 4.2 `lib/billing/access.ts`
Pure `evaluateAccess(sub, now): "ok" | "trial_expired" | "payment_failed"`, extracted from the current trainer gate in `app/(platform)/layout.tsx` and used for both trainers and members:
- no sub, `CANCELED`, or `TRIALING && trialEndsAt < now` → `trial_expired`
- `PAST_DUE` / `UNPAID` → `payment_failed`
- otherwise `ok`

### 4.3 Platform layout gate (`app/(platform)/layout.tsx`)
- Load the user's `Organization` once; compute capabilities.
- `TRAINER` user and `billing === "trainer"` → existing trainer check via `evaluateAccess(trainerSubscription)`.
- `TRAINER` user in a `member`-billing org (platform staff) → no billing gate.
- `CLIENT` user and `billing === "member"` → `evaluateAccess(memberSubscription)`; redirect to `/billing?reason=…`.
- Pass capabilities to `Sidebar` so hidden features don't render.

### 4.4 Hidden-feature route guards
A small helper `requireCapability(cap)` used in the layouts/pages for messages, voice notes, check-ins and clinical notes; redirects to `/dashboard` when the capability is false. API routes for those features return 403 under the same condition.

### 4.5 Join flow
- **`app/join/[slug]/page.tsx`** (public; add to `proxy.ts` public routes): resolves club by `joinSlug`, renders with that org's branding, shows access-code form. Unknown slug → 404.
- **Server action `verifyJoinCode(slug, code)`**: constant-time compare against `joinCode`; rate-limited per IP+slug; on success sets a signed, httpOnly, 30-minute cookie `club_join={orgId}`. Generic error on failure.
- **Sign-up**: Clerk sign-up with redirect back to `/join/[slug]/complete`.
- **`app/join/[slug]/complete`** (server): requires auth + valid cookie for this org. Rejects if the user already has a `User` row with a different `clerkOrgId` or role TRAINER ("This email is already linked to another account"). Otherwise calls `clerkClient.organizations.createOrganizationMembership({ role: "org:member" })` (skip if already a member), clears the cookie, redirects to `/onboarding/client`.
- **Clerk webhook `organizationMembership.created`** (extend existing handler): after the CLIENT upsert, if the org's capabilities are `billing: "member"`:
  - upsert `MemberSubscription` (`TRIALING`, `trialEndsAt = now + org.trialDays`) — idempotent on `userId`;
  - enqueue starter-program assignment (background; do not block the webhook). The existing `applyPendingAssignmentsForNewClient` lookup is unaffected.

### 4.6 Starter programs & progression — `lib/services/club-starter.service.ts`
- `assignStarterProgram(userId, orgId)`: picks the first starter template not yet assigned to the user, `duplicateProgram(template)` then `assignProgram(copy)` (never assign a template directly — see `program.service.ts`). Sets `starterStatus`. Runs in the background because a clone can take ~20s; retried on failure, idempotent (skips a template the user already has a copy of).
- **Progression hook**: when a club member's program transitions to `COMPLETED`, call `assignStarterProgram` for the next template. None left → no-op (dashboard shows "You've completed all programs").

### 4.7 Member billing
- **`/billing`**: when the viewer is a club member, render a member variant: club branding, price (from the Stripe price), trial status, "Subscribe" button; for active members, "Manage billing" → Stripe Customer Portal.
- **`POST /api/checkout/member`**: creates a Stripe customer if missing (stores `stripeCustomerId`), creates a Checkout Session `mode: "subscription"` with `org.stripePriceId`, `metadata: { purchaseType: "member_subscription", userId }`.
- **`lib/services/member-billing.service.ts`**: `activateMemberFromCheckout(session)` and `syncMemberSubscriptionFromStripe(customerId, subscription)` — same `updateMany` no-op-on-missing pattern as `stripe-billing.service.ts`.
- **Stripe webhook** (`app/api/stripe/webhook/route.ts`): `checkout.session.completed` branches on `metadata.purchaseType === "member_subscription"`; `customer.subscription.updated/deleted` route to the member service when the customer matches a `MemberSubscription`, else the existing trainer path. Trainer billing code is not modified.

### 4.8 Trial reminders
- **Cron `app/api/cron/member-trial-reminders`** (daily): finds `TRIALING` members whose `trialEndsAt` is within 3 days / 1 day / past, and whose `remindersSent` lacks that key. Sends a Resend email (club-branded, Subscribe CTA to `/billing`), then pushes the key. Respects existing notification preferences for marketing-type email if applicable.

### 4.9 Member UX
- Sidebar hides messaging, voice notes, check-ins, notes per capabilities.
- Trial banner in the client shell: "X days left in your free trial — Subscribe".
- No trainer name/avatar in member surfaces; club branding (existing org branding) fills that role.

### 4.10 Super admin — `/admin/clubs`
- **List**: club name, members, trialing, paying, trial→paid conversion, MRR (price × active).
- **Create club** form: name, join slug, access code, trial days, Stripe price ID, branding, starter programs (ordered, chosen from platform staff templates). Creates Clerk org, `Organization` row (`type: CLUB`), and platform staff membership. Validates slug uniqueness and that the Stripe price exists.
- **Club detail**: edit code / price / trial days / starter list; member table with status, trial end, starter status; "Extend trial" action (sets new `trialEndsAt`, reverts `CANCELED`-by-expiry to `TRIALING`).
- **Org type** field on org admin views: editable only when the org has zero CLIENT users.
- All admin mutations write to the existing audit log.
- Queries go in `lib/services/admin.service.ts` (or a sibling `admin-clubs.service.ts`); layout gate remains `requireSuperAdmin()`.

## 5. Error handling

| Case | Behavior |
|---|---|
| Wrong access code | Generic error; rate-limited |
| Join cookie missing/expired at `/complete` | Back to `/join/[slug]` to re-enter code |
| Email tied to another org / a trainer | Join blocked with explanation; no membership created |
| Starter assignment fails | Retry; `starterStatus = FAILED` visible in admin; signup unaffected |
| Stripe event for unknown customer | No-op (updateMany), 200 to Stripe |
| Duplicate Clerk/Stripe webhook deliveries | Upserts / idempotent writes; no double subscriptions or emails |
| Club `stripePriceId` missing | Subscribe button disabled with "Contact support"; admin create form prevents this |

## 6. Testing

- **Unit**: `evaluateAccess` (all statuses × dates), `getOrgCapabilities`, join-code verification + rate limit, reminder selection, starter progression selection.
- **Webhook**: Clerk `organizationMembership.created` in a CLUB org creates `MemberSubscription` + enqueues starter; in a TRAINER org does neither. Stripe member events set ACTIVE / PAST_DUE / CANCELED; replays are harmless.
- **Regression**: trainer gate and invited-client flow unchanged in TRAINER orgs; platform staff not gated in club orgs.
- **Manual E2E (Stripe test mode)**: create club → join with code → programs appear → force `trialEndsAt` into the past → blocked → subscribe → access restored → cancel in portal → blocked at period end.

## 7. Rollout notes

- Schema is additive (`type` defaults to `TRAINER`); `prisma db push` before deploy. Per project notes, `.env` points at production — the owner runs the push/rollout.
- Confirm the Clerk production plan's org membership limit covers expected club sizes.
- Create one Stripe product/price per club in Stripe before creating the club in admin.
- Provision the platform staff Clerk user (TRAINER) before the first club.

## 8. Out of scope (v1)

Card-up-front trials; club-subsidized pricing; email allowlists; one person in multiple orgs; org type migration once clients exist; club-facing admin logins; human coaching in clubs.
