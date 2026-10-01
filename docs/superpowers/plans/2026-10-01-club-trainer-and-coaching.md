# Club Trainer & Paid Coaching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Remove the two platform env vars. Give every club its own invited trainer who runs it in the normal trainer portal. Add a paid, trainer-approved coaching add-on that unlocks messaging, check-ins and coach notifications for individual club members.

**Architecture:**
- Capabilities become per-user via `getUserCapabilities({ orgType, role, coachingActive })`, still the only branch on org type.
- The club trainer is a Clerk org invitation (`invitedRole: "TRAINER"`) resolved by the existing membership webhook through a shared `ensureClubTrainerUser`.
- Coaching is a `MemberCoaching` row driven by a pure state machine, paid through a separate Stripe subscription that is routed before the membership and trainer handlers in the webhook.

**Tech stack:** Next.js App Router, Prisma (MongoDB), Clerk v7, Stripe, Resend, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-01-club-trainer-and-coaching-design.md`. It extends `docs/superpowers/specs/2026-09-29-club-member-billing-design.md`. Current code is the uncommitted `club-orgs` branch.

## Global Constraints

- **Never** run `git add`, `commit`, `stash`, `checkout` or `reset`. Leave all changes uncommitted; the owner commits.
- **Never** run `prisma db push`, migrations, or anything that touches live services (`.env` is production). `npx prisma generate` is allowed.
- New fields on existing Mongo collections are optional, with no `@default` that existing docs would lack. Never put `@unique` on an optional field (null collisions on MongoDB).
- `lib/org-capabilities.ts` is the only code that branches on org type. Everything else reads capabilities.
- Trainer orgs must behave exactly as before. Every new guard needs a trainer-org regression test.
- Coaching Stripe events must **never** be written to `MemberSubscription` or `TrainerSubscription`.
- Use design tokens only (`npm run lint:palette` stays at 0). Production files must be eslint-clean. `as any` in test mocks is fine.
- Every super-admin and trainer mutation is audited with `logUserAudit`. Add catalog entries as needed.
- Server actions return the codebase's `{ ok: true, ... } | { ok: false, error }` shape. Only the `ClubError` or coaching-error message reaches the UI; unexpected errors get a generic message.
- The full `npx vitest run` must pass under `TZ=UTC`. `client-dashboard-render.test.tsx` has a known pre-existing timezone flake when local date ≠ UTC date.

## Review Focus

1. A coaching `customer.subscription.created` arrives **before** `checkout.session.completed` while the member is still on a no-card trial (membership row `stripeSubscriptionId` is null). It must update coaching only, never membership (Task 6 test).
2. An existing app user's email is entered as club trainer. This must be refused with nothing created, and the webhook must never move an existing trainer-org user into a club (Task 3 tests).
3. A club trainer messages, or assigns a check-in to, an uncoached member. This must be refused. A coached member can message the trainer, and the trainer gets their workout notifications (Task 2 / Task 8 tests).
4. Membership cancelled while coaching is ACTIVE. Coaching must be cancelled in Stripe and the row set to CANCELED, and a later replayed coaching event must not reactivate it (Task 6 test).
5. Trainer replaced. The new trainer must own existing member programs and starter templates so they can edit them, and starter assignment must keep working (Task 3 test).

---

## File Map

| File | Change |
|---|---|
| `lib/clubs/join-token.ts` | Key derived from `CLERK_SECRET_KEY` |
| `lib/org-capabilities.ts`, `lib/org-capabilities.server.ts` | `getUserCapabilities`; `getCapabilitiesForUser(user)` takes role + coaching |
| All capability call sites | Pass the user object |
| `prisma/schema.prisma` | `Organization.coachingStripePriceId`, `CoachingStatus`, `MemberCoaching` |
| `lib/services/club-trainer.service.ts` (new) | Invite, resend, replace, `getClubTrainer`, `ensureClubTrainerUser`, ownership transfer |
| `app/onboarding/club-trainer/page.tsx` (+ form, action) | Minimal trainer onboarding |
| `lib/services/club.service.ts` | Trainer email on create, coaching price, starter templates from trainer, drop `getPlatformStaffUser` |
| `lib/services/club-member.service.ts` | Use `getClubTrainer` |
| `lib/clubs/coaching-state.ts` (new) | Pure state machine |
| `lib/services/coaching.service.ts` (new) | Request, respond, withdraw, end, membership cascade, Stripe sync |
| `app/api/checkout/coaching/route.ts` (new) | Coaching checkout |
| `app/api/stripe/webhook/route.ts` | Coaching routing first |
| Email templates + notification types | COACHING_REQUESTED / ACCEPTED / DECLINED |
| Member UI | Dashboard coaching card, billing section |
| Trainer UI | Requests card, client badges, client coaching panel, guards |
| Admin UI | Trainer email + coaching price, trainer section, coaching column |

---

### Task 1: Derive the join key from the Clerk secret

**Files:** `lib/clubs/join-token.ts`, `lib/clubs/__tests__/join-token.test.ts`, the two `app/join/**` comments mentioning `CLUB_JOIN_SECRET`.

- [ ] Replace `secret()` with:

```ts
/**
 * Signing key for the join cookie, derived from the Clerk secret so there is
 * no extra env var. The label scopes it to this one purpose.
 */
function secret(): Buffer {
  const base = process.env.CLERK_SECRET_KEY;
  if (!base || base.length < 20) throw new Error("CLERK_SECRET_KEY must be set to sign club join tokens");
  return createHmac("sha256", base).update("club-join-token:v1").digest();
}
```

  `mac()` uses `createHmac("sha256", secret())`.
- [ ] Tests: set `process.env.CLERK_SECRET_KEY` in `beforeAll` instead of `CLUB_JOIN_SECRET`. Add these cases:
  - a missing key throws on sign
  - a token signed with key A fails verification with key B
- [ ] Update the comments in `app/join/[slug]/page.tsx` and `complete/page.tsx` to refer to `CLERK_SECRET_KEY`.
- [ ] `grep -rn CLUB_JOIN_SECRET lib app actions` returns nothing (the hand-off doc is updated in Task 9).
- [ ] Verify: focused tests, then tsc.

### Task 2: Per-user capabilities

**Files:** `lib/org-capabilities.ts`, `lib/org-capabilities.server.ts`, `lib/__tests__/org-capabilities.test.ts`, plus every caller of `getCapabilitiesForUser`, `getCurrentCapabilities`, `requireCapability` and `getOrgCapabilities(org)` used for user-facing decisions:
- `app/(platform)/layout.tsx`
- `app/(platform)/dashboard/page.tsx`
- `actions/{message,voice-message,voice-memo,session-v2,nutrition,checkin}-actions.ts`
- `app/billing/page.tsx` (billing branch only)

**Interfaces produced:**

```ts
export interface OrgCapabilities {
  billing: "trainer" | "member";
  messaging: boolean;
  checkIns: boolean;
  coachNotifications: boolean;
  /** Trainer billing page/nav is shown (false for club trainers — they never pay). */
  trainerBilling: boolean;
}
export function getUserCapabilities(input: {
  orgType: OrgType; role: "TRAINER" | "CLIENT"; coachingActive: boolean;
}): OrgCapabilities
export function hiddenNavHrefs(caps: OrgCapabilities): string[] // + "/settings/billing" when !trainerBilling
// server
export async function getCapabilitiesForUser(user: { id: string; role: "TRAINER" | "CLIENT"; clerkOrgId: string | null }): Promise<OrgCapabilities>
export async function getCoachingActive(userId: string): Promise<boolean> // MemberCoaching status === "ACTIVE"
```

- Keep `getOrgCapabilities(org)` as the org-level default (= `getUserCapabilities({ orgType, role: "CLIENT", coachingActive: false })` for clubs, trainer caps otherwise). It is used where no user exists (webhooks, billing routing).
- `getCapabilitiesForUser` only queries `MemberCoaching` for a CLIENT in a CLUB org. Use `prisma.memberCoaching` once the Task 4 schema exists. **Do Task 4's schema step first inside this task**: add the `CoachingStatus` enum, the `MemberCoaching` model and `User.memberCoaching MemberCoaching? @relation("MemberCoaching")` exactly as in spec §3, plus `Organization.coachingStripePriceId String?`. Then run `npx prisma generate`.
- **Pair rule helper (server):** `canCoachInteract(trainer, client): Promise<boolean>`. It returns true when the client's capabilities have `messaging` (client side) and the trainer is in the same org. Use it in:
  - `sendMessageAction` when the sender is a TRAINER (check the recipient)
  - voice-note/voice-memo sends to a client
  - `assignCheckInAction`

  When it is false, refuse with `MESSAGING_UNAVAILABLE` or `"Check-ins aren't available for this client."` (export a constant).
- **Tests:**
  - The full table from spec §4 for `getUserCapabilities`, including hidden nav.
  - `getCapabilitiesForUser` for trainer-org (no coaching query), club trainer, club member coached and uncoached.
  - Each guarded action: trainer→uncoached member refused; trainer→coached member allowed; trainer-org trainer→client unchanged (regression).
  - Existing capability-related tests updated, not deleted.

### Task 3: Club trainer lifecycle

**Files:**
- Create: `lib/services/club-trainer.service.ts` and its tests; `app/onboarding/club-trainer/page.tsx`; `components/onboarding/club-trainer-onboarding-form.tsx`; `actions/club-trainer-onboarding-actions.ts`.
- Modify: `lib/services/club.service.ts`; `lib/services/club-member.service.ts`; `app/api/webhooks/clerk/route.ts`; `app/(platform)/layout.tsx` and `app/onboarding/page.tsx` (redirects); `lib/auth/public-routes.ts` (only if needed: `/onboarding(.*)` is already public); the `/join` pages and `actions/club-join-actions.ts` (closed-until-trainer); `lib/audit/catalog.ts`.

**Interfaces produced:**

```ts
export const CLUB_TRAINER_INVITE_ROLE = "TRAINER";
export async function getClubTrainer(clerkOrgId: string): Promise<User | null> // TRAINER, onboarded first, newest
export async function inviteClubTrainer(clerkOrgId: string, email: string): Promise<void> // revokes pending, creates invite (org:admin, publicMetadata.invitedRole, redirectUrl appBaseUrl()+"/onboarding/club-trainer"); throws ClubError("trainer_email_taken") if a User has that email
export async function getPendingTrainerInvite(clerkOrgId: string): Promise<{ email: string; createdAt: Date } | null>
export async function removeClubTrainer(clerkOrgId: string): Promise<void> // deletes Clerk membership of current trainer; nulls their clerkOrgId
export async function ensureClubTrainerUser(clerkUserId: string, org: Organization): Promise<User> // upsert role TRAINER, clerkOrgId, onboarded false on create; then transferClubOwnership
export async function transferClubOwnership(clerkOrgId: string, toTrainerId: string): Promise<{ programs: number; templates: number }>
```

- Add `ClubErrorCode` `"trainer_email_taken" | "trainer_invite_failed"` in `club.service.ts`.
- **`createClub`:** `ClubInput` gains `trainerEmail: string` (required, validated, lower-cased) and `coachingStripePriceId: string | null` (optional; when set it must be an active recurring price, same check as membership). After the DB row is created, call `inviteClubTrainer`. On failure, delete the DB row and the Clerk org and throw `ClubError("trainer_invite_failed")`. The email-taken check runs **before** anything is created.
- **`updateClub`:** takes the coaching price; the trainer email is not edited here.
- **Starters (`assertStarters`):** allow `isGlobal`, OR `isTemplate && trainerId === (await getClubTrainer(org)).id`, and they must be Scheduled. On create (no trainer yet), Global only.
- **Remove `getPlatformStaffUser`.** In `club-member.service.ts`, `assignNextStarterProgram` uses `getClubTrainer(club.clerkOrgId)`. If it is null, release the claim back to PENDING and return `"skipped"` (no FAILED).
- **Webhook `organizationMembership.created`:** when the resolved invite metadata has `invitedRole === "TRAINER"` and `getOrgCapabilities(org).billing === "member"`, call `ensureClubTrainerUser` instead of the CLIENT upsert, and skip `ensureMemberSubscription` and pending assignments. Extend `InviteClientMetadata` (or a sibling type) with `invitedRole?: "TRAINER"`. A trainer org ignores `invitedRole` (regression test).
- **Onboarding:** `/onboarding/club-trainer`:
  - Unauthenticated: render `<SignUp routing="hash" forceRedirectUrl="/onboarding/club-trainer" />`, same as the client page.
  - Authenticated with no DB user: look up Clerk memberships for a CLUB org whose accepted invitation for this email has `invitedRole TRAINER`, then call `ensureClubTrainerUser`.
  - Form for first and last name → action sets the names and `onboarded: true` → `/dashboard`.
  - It refuses (shows a message) if the user isn't a club trainer.
  - Branded with the club's branding.
- **Redirects:**
  - Platform layout: when `!user.onboarded && user.role === "TRAINER"` and the user's org is member-billed → `/onboarding/club-trainer`.
  - `/onboarding` (trainer-org signup): same redirect if the user is already a club trainer.
- **Join gate:** `/join/[slug]`, `/join/[slug]/complete` and `verifyJoinCodeAction` refuse when `getClubTrainer` is null. The page shows "This club isn't open yet. Please check back soon." and the action returns that error.
- **Tests:**
  - invite (args, revoke-pending, email-taken before creation, failure rollback in createClub)
  - `ensureClubTrainerUser` (TRAINER role, no MemberSubscription, transfer called)
  - `transferClubOwnership` (member programs + starter templates authored by the old trainer)
  - `getClubTrainer`
  - webhook TRAINER path vs CLIENT path vs trainer-org-ignores
  - starter assign with no trainer → skipped / PENDING
  - join closed when no trainer
  - layout redirect for an un-onboarded club trainer

### Task 4: Coaching state machine and service

(Schema was added in Task 2.)

**Files:**
- Create: `lib/clubs/coaching-state.ts` and its tests; `lib/services/coaching.service.ts` and its tests; three email templates under `lib/email/templates/` (`coaching-requested.tsx`, `coaching-accepted.tsx`, `coaching-declined.tsx`) with render tests.
- Modify: `lib/services/notification.service.ts` (types `COACHING_REQUESTED`, `COACHING_ACCEPTED`, `COACHING_DECLINED`, wired like existing types, including email mapping and preferences); `lib/audit/catalog.ts`.

**Interfaces produced:**

```ts
// lib/clubs/coaching-state.ts
export type CoachingEvent = "member_request" | "trainer_accept" | "trainer_decline" | "member_withdraw" | "trainer_withdraw"
  | "payment_succeeded" | "payment_failed" | "subscription_ended" | "membership_ended";
export function nextCoachingStatus(current: CoachingStatus | null, event: CoachingEvent): CoachingStatus | null // null = invalid
// lib/services/coaching.service.ts
export class CoachingError extends Error { code: "not_offered" | "not_eligible" | "invalid_state" | "not_found" | "forbidden" }
export async function getCoachingForUser(userId: string): Promise<MemberCoaching | null>
export async function requestCoaching(member: User, note: string): Promise<MemberCoaching>
export async function respondToCoachingRequest(trainer: User, memberId: string, accept: boolean, note?: string): Promise<MemberCoaching>
export async function withdrawCoaching(actor: User, memberId: string): Promise<MemberCoaching> // member or trainer; REQUESTED/ACCEPTED only
export async function endCoaching(trainer: User, memberId: string): Promise<MemberCoaching> // ACTIVE/PAST_DUE → stripe cancel_at_period_end; ACCEPTED → CANCELED
export async function cancelCoachingForEndedMembership(userId: string): Promise<void> // stripe cancel now if sub; status CANCELED
export async function listCoachingRequests(clerkOrgId: string): Promise<(MemberCoaching & { user: Pick<User,"id"|"firstName"|"lastName"|"email"> })[]> // REQUESTED, oldest first
```

- Every status write is conditional, e.g. `updateMany({ where: { userId, status: current }, ... })`, and checks `count === 1`, so concurrent and replayed events are safe.
- **`requestCoaching` eligibility:**
  - the member is a CLIENT in a CLUB org with `coachingStripePriceId`
  - `evaluateMemberAccess(memberSubscription) === "ok"`
  - `getClubTrainer` is non-null
  - the note is trimmed, 1–1000 characters
- **Notifications:**
  - Request → trainer: the link goes to the member's client page.
  - Accept → member: the link goes to the dashboard.
  - Decline → member, including the trainer's note if given.
  - Emails go through `notifyUser` with club branding.
- **Tests:**
  - every state transition (valid and invalid)
  - each service function's guards
  - conditional-write races (count 0 → `invalid_state`)
  - the notifications sent
  - the membership-ended cascade (Stripe cancel called when a subscription exists)

### Task 5: Coaching checkout route and shared Stripe customer helper

**Files:**
- Create: `app/api/checkout/coaching/route.ts` and its tests.
- Modify: `app/api/checkout/member/route.ts` (extract the customer reuse/create into `lib/services/member-billing.service.ts` `ensureMemberStripeCustomer(user, sub, org): Promise<string>`, keeping the idempotency key and behaviour); `lib/auth/public-routes.ts` (not public, so nothing to do).

- **Coaching route rules:**
  - CLIENT in a member-billed org with `coachingStripePriceId`, otherwise 403
  - coaching status `ACCEPTED`, otherwise 409
  - membership access ok, otherwise 409
  - the customer comes from `ensureMemberStripeCustomer`
  - session: `mode: "subscription"`, `line_items` = coaching price, `metadata` and `subscription_data.metadata` = `{ purchaseType: "member_coaching", userId }`, `success_url` `/billing/success?coaching=1`, `cancel_url` `/dashboard`
- **Tests:** 403, 409 (not accepted), 409 (membership not ok), customer reuse, metadata. The membership checkout tests must still pass unchanged.

### Task 6: Webhook routing for coaching subscriptions

**Files:** `app/api/stripe/webhook/route.ts`; `lib/services/coaching.service.ts` (Stripe sync functions); `lib/services/member-billing.service.ts` (membership-ended cascade hook); tests in `app/api/stripe/__tests__/webhook.coaching.test.ts` and the service tests.

**Interfaces produced (in `coaching.service.ts`):**

```ts
export const COACHING_PURCHASE_TYPE = "member_coaching";
export async function activateCoachingFromCheckout(session: Stripe.Checkout.Session): Promise<void> // ACCEPTED|PAST_DUE→ACTIVE (+ACTIVE idempotent), stores sub id, period end
export async function syncCoachingFromStripe(subscription: Stripe.Subscription): Promise<boolean> // true = this was a coaching subscription (handled)
export async function markCoachingPastDue(subscriptionId: string): Promise<boolean>
```

- `syncCoachingFromStripe` is a coaching sub when `subscription.metadata.purchaseType === COACHING_PURCHASE_TYPE` **or** a row has `stripeSubscriptionId === subscription.id`. It matches the row by metadata `userId` (setting `stripeSubscriptionId` if null) or by sub id, then maps the status:
  - `active`/`trialing` → `payment_succeeded`
  - `past_due`/`unpaid` → `payment_failed`
  - `canceled`/`incomplete_expired` → `subscription_ended`
  - plus `currentPeriodEnd` and `cancelAtPeriodEnd`

  An invalid transition is ignored (logged) but still returns true, so a replayed active event after CANCELED never reactivates.
- **Route changes:**
  - `checkout.session.completed`: add a `COACHING_PURCHASE_TYPE` branch **before** the member branch.
  - `customer.subscription.created/updated/deleted`: first `if (await syncCoachingFromStripe(sub)) break;`
  - `invoice.payment_failed`: compute the invoice sub id as today; first `if (subId && await markCoachingPastDue(subId)) break;`
- **Membership cascade:** wherever a membership row becomes CANCELED (`markMemberCanceled` success, or `syncMemberSubscriptionFromStripe` writing CANCELED), call `cancelCoachingForEndedMembership(userId)` best-effort, so it never fails the webhook. `markMemberCanceled` may need to return the affected userId(s): adjust its return type minimally and update callers and tests.
- **Tests (Review Focus 1 and 4):**
  - coaching `subscription.created` before checkout with the membership row's `stripeSubscriptionId` null → only coaching updated, member and trainer sync **not called**
  - checkout coaching → ACTIVE
  - updated `past_due` → PAST_DUE
  - deleted → CANCELED
  - replayed active after CANCELED → stays CANCELED
  - payment_failed on a coaching sub → coaching PAST_DUE, member untouched
  - membership deleted with ACTIVE coaching → Stripe cancel called and coaching CANCELED
  - all existing member and trainer webhook tests still pass

### Task 7: Member UI (dashboard coaching card and billing section)

**Files:**
- Create: `components/dashboard/coaching-card.tsx`, `components/dashboard/request-coaching-dialog.tsx`, `actions/coaching-actions.ts` (member actions: `requestCoachingAction(note)`, `withdrawCoachingRequestAction()`).
- Modify: `app/(platform)/dashboard/page.tsx` and `components/dashboard/client-dashboard.tsx` (pass a coaching view-model: status, price label, `offered`); `app/billing/member-billing-view.tsx` (coaching section); `app/billing/success/page.tsx` (if `?coaching=1`, "Coaching is starting" copy, polling the existing status route or a coaching flag).

- The card states are exactly as in spec §7. Price label comes from `stripe.prices.retrieve(org.coachingStripePriceId)`, formatted with `formatStripeAmount`, and cached per request.
- ACCEPTED → "Start coaching" POSTs `/api/checkout/coaching` and redirects. PAST_DUE → "Update payment" goes to the member portal.
- Not offered (no coaching price) or not a club → no card. Trainer-org clients see nothing new.
- `/api/stripe/status`, if it is used for the success page: add coaching status for CLIENTs only if needed for `?coaching=1`.
- **Tests:** card render per status (follow the existing dashboard render test pattern), action guards (delegating to the service), and "not offered" renders nothing.

### Task 8: Club trainer UI (requests, badges, client coaching panel)

**Files:**
- Modify: the trainer dashboard page/component (find with `grep -rn "TrainerDashboard\|trainer-dashboard" components app`); `app/(platform)/clients/page.tsx` and its list component (coaching badge); `app/(platform)/clients/[id]/page.tsx` (coaching panel; hide Message and assign-check-in controls for uncoached club members using the client's capabilities); `actions/coaching-actions.ts` (trainer actions: `respondCoachingRequestAction(memberId, accept, note?)`, `endCoachingAction(memberId)`, `withdrawCoachingOfferAction(memberId)`).

- **Requests card:** only for a club trainer. It lists `listCoachingRequests(org)` with each member's note, plus Accept and Decline (optional note dialog). Empty state: "No coaching requests".
- **Badges:**
  - REQUESTED → "Coaching requested" (warning)
  - ACCEPTED → "Awaiting payment" (info)
  - ACTIVE → "Coaching" (success)
  - PAST_DUE → "Coaching paused" (danger)

  Use `StatusBadge` and `lib/ui/status.ts`.
- **Client coaching panel:** shows the status, the member's note, and the actions valid for that status (via `nextCoachingStatus`). End coaching uses the existing `ConfirmDialog` and shows "ends <periodEnd>" when `cancelAtPeriodEnd`.
- Trainer-org pages must be visually unchanged (no panel, no badges).
- **Tests:** action guards (trainer from another org → forbidden), the panel action set per status, and a trainer-org regression (no coaching UI data fetched).

### Task 9: Admin updates, hand-off and verification

**Files:**
- Modify: `app/admin/clubs/club-form.tsx` (trainer email on create only; coaching price on create and edit); `actions/admin-club-actions.ts` (`resendClubTrainerInviteAction(orgId)`, `replaceClubTrainerAction(orgId, email)`, both audited); `app/admin/clubs/page.tsx` (Coached count; Trainer status column: Active name / Invite pending / None); `app/admin/clubs/[orgId]/page.tsx` (trainer section with Resend / Replace; Coaching column in the member table); `lib/services/club.service.ts` `listClubsWithStats` (+ `coached`, + trainer status); `docs/superpowers/plans/2026-09-29-club-member-billing-handoff.md`.
- **Hand-off doc:**
  - Remove both env vars from the env table and rollout.
  - Rollout: create a dedicated email for each club trainer; the club opens once the trainer accepts; create the coaching price in Stripe if it is offered.
  - E2E: add trainer accept, the coaching request → accept → pay → inbox works → cancel flow.
  - Decisions D1–D15 summarised.
  - Follow-ups updated: the branding editor follow-up is resolved via the club trainer.
- **Verification:**
  - `TZ=UTC npx vitest run`
  - `npx tsc --noEmit`
  - `npm run lint:palette`
  - eslint on changed production files
  - `DATABASE_URL="mongodb://127.0.0.1:1/none" npx next build`
  - trainer regression read-through (record file:line)
- **Tests:** the admin action guards (super admin, audit, ClubError surfacing) and the stats additions.
