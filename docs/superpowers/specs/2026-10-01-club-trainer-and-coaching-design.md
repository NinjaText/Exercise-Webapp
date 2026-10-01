# Club Trainer & Paid Coaching Add-on — Design (addendum)

**Date:** 2026-10-01
**Extends:** `docs/superpowers/specs/2026-09-29-club-member-billing-design.md` (club orgs, built on branch `club-orgs`)
**Status:** Design approved in chat 2026-10-01

## 1. Goals

1. **No platform-level setup.** Remove the `CLUB_JOIN_SECRET` and `PLATFORM_STAFF_EMAIL` env vars.
2. **Each club has its own trainer.** The club trainer manages the club in the normal trainer portal and replaces the single platform staff account.
3. **Paid coaching add-on.** Club members are self-guided by default. A member can request personal coaching; the trainer accepts; the member pays a per-club monthly coaching price; coaching features turn on for that member only.

Trainer orgs (non-club) must behave exactly as today.

## 2. Decisions (approved 2026-10-01)

| # | Decision |
|---|---|
| D1 | The join-cookie signing key is derived from the existing `CLERK_SECRET_KEY` (HMAC with a fixed label). The per-club **access code** is unchanged. |
| D2 | "New club" gets a required **Club trainer email**. Creating the club sends a Clerk org invitation to that email with role `org:admin` and `publicMetadata.invitedRole = "TRAINER"`. |
| D3 | On accepting the invite, the user becomes a **TRAINER in that club org**. They get a minimal onboarding (name) and no trainer billing or trial. The club org is member-billed. |
| D4 | One person belongs to one org. The trainer email must not belong to an existing app user. The UI explains that a dedicated account is needed. |
| D5 | A club is **open for joining only once its trainer has accepted**. Before that, `/join/<slug>` shows "This club isn't open yet". |
| D6 | Member program copies are owned by the **club trainer** (`getClubTrainer(clerkOrgId)`), replacing `getPlatformStaffUser`. |
| D7 | Starter programs can be **Global Programs** or the **club trainer's own templates**. Both must be Scheduled. |
| D8 | Admin can **resend** a pending trainer invite and **replace** the trainer. On replace, the new trainer takes ownership of the club's member programs and of the starter templates the old trainer authored. |
| D9 | The club trainer can use the existing **branding editor** for their org, which resolves the earlier follow-up. They do not see the trainer Billing page. |
| D10 | **Coaching is a paid add-on.** Each club has an optional **Coaching price** (a recurring Stripe price). Empty means coaching is not offered. |
| D11 | **Flow:** member requests (with a note) → trainer accepts or declines → member pays via Stripe Checkout → coaching becomes ACTIVE on successful payment. |
| D12 | Coaching is a **separate Stripe subscription** on the member's existing Stripe customer, so membership billing is untouched. A member may buy coaching during their free trial; coaching is charged immediately. |
| D13 | **Coaching on** means, for that member only: messaging (inbox and voice notes), check-ins, coach notifications, and the trainer can message the member and assign check-ins. |
| D14 | **Ending coaching:** the member cancels in the Stripe portal (ends at period end). The trainer can end it (cancel at period end), or withdraw an accepted-but-unpaid offer. If the membership ends, coaching is cancelled immediately. A failed payment sets PAST_DUE, which pauses coaching until it is fixed. |
| D15 | Every capability decision still lives in `lib/org-capabilities.ts`. It now takes the user's role and coaching state as well as the org type. |

## 3. Data model

```prisma
model Organization {
  // ...existing...
  /// Club-only. Recurring Stripe price for the coaching add-on; null → coaching not offered.
  coachingStripePriceId String?
}

enum CoachingStatus {
  REQUESTED   // member asked; waiting on trainer
  ACCEPTED    // trainer accepted; waiting on member payment
  ACTIVE      // paid; coaching features on
  PAST_DUE    // payment failed; features paused
  DECLINED    // trainer declined (member may re-request)
  CANCELED    // ended (member may re-request)
}

/// One row per club member; reused across request cycles.
model MemberCoaching {
  id                   String         @id @default(auto()) @map("_id") @db.ObjectId
  userId               String         @unique @db.ObjectId
  user                 User           @relation("MemberCoaching", fields: [userId], references: [id])
  clerkOrgId           String
  status               CoachingStatus
  requestNote          String?
  responseNote         String?
  requestedAt          DateTime
  respondedAt          DateTime?
  respondedById        String?        @db.ObjectId
  stripeSubscriptionId String?
  currentPeriodEnd     DateTime?
  cancelAtPeriodEnd    Boolean        @default(false)
  createdAt            DateTime       @default(now())
  updatedAt            DateTime       @updatedAt

  @@index([clerkOrgId, status])
  @@index([stripeSubscriptionId])
}
```

`stripeSubscriptionId` is intentionally **not** `@unique`. On MongoDB, optional unique fields collide on null (same reasoning as `joinSlug`).

## 4. Capabilities (D15)

`lib/org-capabilities.ts` gains a pure function:

```ts
getUserCapabilities(input: {
  orgType: OrgType;              // via getOrgType(org)
  role: "TRAINER" | "CLIENT";
  coachingActive: boolean;       // MemberCoaching.status === "ACTIVE"
}): OrgCapabilities
```

| Who | billing | messaging | checkIns | coachNotifications | hidden nav |
|---|---|---|---|---|---|
| Trainer-org anyone | trainer | ✓ | ✓ | ✓ | — |
| Club trainer | member | ✓ | ✓ | ✓ | `/settings/billing` |
| Club member, not coached | member | ✗ | ✗ | ✗ | `/messages`, `/check-ins` |
| Club member, coached | member | ✓ | ✓ | ✓ | — |

The server helper `getCapabilitiesForUser(user: { id, role, clerkOrgId })` loads the org and, for CLIENTs in clubs, their `MemberCoaching` status. Every existing caller uses it: layout, dashboard, `requireCapability`, the message, voice-note and voice-memo send actions, session-v2 notifications, nutrition, and check-in submit.

Pair rule: trainer→client messaging and check-in assignment check the **recipient** client's capabilities. A club trainer cannot message or assign check-ins to an uncoached member.

## 5. Club trainer lifecycle

- **Create club:** validate the trainer email (format; not an existing `User`). Create the Clerk org and DB row as today, then `createOrganizationInvitation({ organizationId, emailAddress, role: "org:admin", publicMetadata: { invitedRole: "TRAINER" }, redirectUrl: <app>/onboarding/club-trainer })`. If the invite fails, roll back the Clerk org and the DB row.
- **Accept:** Clerk sign-up via the invite ticket on `/onboarding/club-trainer`. The `organizationMembership.created` webhook resolves the invite metadata. When `invitedRole === "TRAINER"` and the org is a CLUB, it upserts the user with `role: "TRAINER"` (never CLIENT) and `onboarded: false`, and does not create a `MemberSubscription`. A shared `ensureClubTrainerUser(clerkUserId, org)` is used by both the webhook and the onboarding page, so there is no race.
- **Onboarding page:** first and last name, then `onboarded = true` → `/dashboard`. The platform layout and `/onboarding` route a not-onboarded TRAINER in a member-billed org to `/onboarding/club-trainer`, never the trainer-org signup.
- **`getClubTrainer(clerkOrgId)`:** the TRAINER user with that `clerkOrgId` (the most recently onboarded if several), or null.
- **Join gate:** `getClubBySlug` callers (`/join/[slug]`, `/join/[slug]/complete`, `verifyJoinCodeAction`) refuse when `getClubTrainer` is null.
- **Resend:** revoke pending invitations for the org, then create a new one.
- **Replace:** remove the current trainer's Clerk membership (the webhook nulls their `clerkOrgId`), then invite the new email. When the new trainer is ensured, transfer ownership: `Program.trainerId` for programs whose `clientId` is a club member, and for starter templates authored by the previous trainer.

## 6. Coaching lifecycle

State machine, implemented as a pure function `nextCoachingStatus(current, event)`:

| From | Event | To |
|---|---|---|
| none / DECLINED / CANCELED | member_request | REQUESTED |
| REQUESTED | trainer_accept | ACCEPTED |
| REQUESTED | trainer_decline | DECLINED |
| REQUESTED / ACCEPTED | member_withdraw / trainer_withdraw | CANCELED |
| ACCEPTED | payment_succeeded | ACTIVE |
| ACTIVE | payment_failed | PAST_DUE |
| PAST_DUE | payment_succeeded | ACTIVE |
| ACTIVE / PAST_DUE | subscription_ended | CANCELED |
| any non-terminal | membership_ended | CANCELED |

Any other combination is rejected.

- **Request:** allowed only for a CLIENT in a club whose `coachingStripePriceId` is set, whose membership gate is OK (`evaluateMemberAccess` is `ok`), and who has a club trainer. The trainer gets a notification and an email (`COACHING_REQUESTED`).
- **Accept / decline:** only a TRAINER in the same club org. The member gets a notification and an email (`COACHING_ACCEPTED` / `COACHING_DECLINED`).
- **Checkout:** `POST /api/checkout/coaching`. Requires `ACCEPTED`. Reuses or creates the member's Stripe customer through the same helper as membership checkout. Subscription mode with `coachingStripePriceId`, and `metadata` plus `subscription_data.metadata` set to `{ purchaseType: "member_coaching", userId }`.
- **Webhook routing (order matters):**
  1. `checkout.session.completed` with `purchaseType === "member_coaching"` → `activateCoachingFromCheckout`.
  2. `customer.subscription.created/updated/deleted`: if `subscription.metadata.purchaseType === "member_coaching"` OR a `MemberCoaching` row has that `stripeSubscriptionId` → coaching sync (by metadata `userId` or sub id), then **break**. Membership and trainer handlers must never see coaching subscriptions. This guards against a coaching event being written to a trialing member's row whose `stripeSubscriptionId` is still null.
  3. `invoice.payment_failed`: if the invoice's subscription id matches a coaching row → PAST_DUE, then break.
- **Membership ended:** when the member's membership becomes CANCELED (webhook), any ACTIVE or PAST_DUE coaching subscription is cancelled immediately in Stripe and the row is set to CANCELED. ACCEPTED or REQUESTED rows are set to CANCELED.
- **Trainer ends coaching:** set `cancel_at_period_end: true` on the coaching subscription. The deleted event later sets CANCELED. If the row is ACCEPTED (unpaid), set it to CANCELED directly.

## 7. UI

- **Member dashboard coaching card** (club, coaching price set):
  - none / DECLINED / CANCELED → "Request coaching" dialog with a note
  - REQUESTED → "Request sent"
  - ACCEPTED → "Your coach accepted, start coaching for $X/mo" → checkout
  - ACTIVE → "Coaching active · Message your coach"
  - PAST_DUE → "Coaching paused, update payment" → portal
- **Member `/billing`:** a coaching section with status, price, and a manage link.
- **Club trainer dashboard:** a "Coaching requests" card with each member's note and Accept / Decline.
- **Clients list:** a coaching badge per club member (Requested / Coaching / Paused).
- **Client detail:** a coaching panel with status and actions (Accept / Decline / End coaching / Withdraw offer). Message and assign-check-in actions are hidden for uncoached club members.
- **Admin:**
  - New club form: trainer email (required) and coaching price (optional).
  - Club detail: trainer section (status Pending / Active, Resend, Replace).
  - Member table: Coaching column.
  - List: Coached count and trainer status.

## 8. Error handling

| Case | Behavior |
|---|---|
| Trainer email already a user | ClubError `trainer_email_taken`, nothing created |
| Invite API fails on create | Roll back Clerk org and DB row; ClubError surfaced |
| Join before trainer accepted | "This club isn't open yet" |
| Coaching request without price, trainer or good standing | Refused with a clear message |
| Coaching checkout not ACCEPTED | 409 |
| Duplicate / out-of-order Stripe events | Idempotent state-machine updates; coaching events never touch membership rows |
| Message or check-in to uncoached member | Refused (`MESSAGING_UNAVAILABLE` / check-in equivalent) |

## 9. Testing

- **Pure:** `getUserCapabilities` table, `nextCoachingStatus` (every valid and invalid transition), join-key derivation.
- **Services:** club trainer invite, rollback and email-taken; `ensureClubTrainerUser` (role TRAINER, no MemberSubscription, ownership transfer); `getClubTrainer`; coaching request / respond / end / membership cascade.
- **Webhooks:**
  - Clerk TRAINER-invite path vs the client path in a CLUB org, and that a trainer org ignores `invitedRole`.
  - Stripe coaching routing: checkout, created-before-checkout, updated, deleted, payment_failed. Coaching events never touch MemberSubscription or TrainerSubscription.
- **Routes:** coaching checkout (403 / 409 / customer reuse / metadata).
- **Regression:** trainer orgs unchanged; uncoached club members still restricted; coached members get the inbox.
