# Email Notification System — Design Spec

**Date:** 2026-09-21
**Status:** Approved for planning
**Scope:** A central notification dispatcher that pairs every in-app notification with an optional Resend email, governed by per-category user preferences, per-type cooldowns, and one-click unsubscribe. Covers the twelve existing notification sites plus the messaging, check-in, nutrition, and billing events that are currently silent.

## 1. Problem

Resend is already a dependency (`resend@6.9.3`) and five flows already send email, but the system is half-built and the half that exists is fragile.

**Email is hand-rolled at every call site.** Five places each repeat the same block — `getResend().emails.send({ from: process.env.RESEND_FROM_EMAIL ?? "noreply@inmotusrx.com", ... })` — in `app/api/reminders/route.ts:98`, `actions/session-v2-actions.ts:53`, `actions/compliance-actions.ts:102`, `actions/program-actions.ts:991`, and `lib/email/send-program-welcome.ts:12`. The `from` fallback string is duplicated five times.

**Two of the five sends are unguarded, and both break business logic on failure.** `app/api/reminders/route.ts`, `actions/compliance-actions.ts`, and `actions/program-actions.ts` each wrap the send in try/catch. The other two do not:

- `notifyTrainerOnCompletion` (`actions/session-v2-actions.ts:53`) awaits `emails.send()` bare. A missing `RESEND_API_KEY` makes `getResend()` throw, and it propagates out of the action — so a Resend outage currently breaks *finishing a workout*.
- `sendProgramWelcomeEmail` (`lib/services/program-purchase.service.ts:166`) is also bare, and it sits at step 7 of `fulfillProgramPurchase`. A throw there escapes into the webhook's `after()` handler, which marks the `ProgramPurchase` **FAILED** — after the account was created and the programs were assigned. The `retry-program-purchases` cron then re-runs fulfillment and self-heals, so no duplicate email is sent, but a completed purchase is misreported as failed in the interim.

**Templates duplicate their own stylesheet.** Each of the six templates in `lib/email/templates/` carries its own ~100-line `styles: Record<string, React.CSSProperties>` object and its own copy of the outer-table / card / header-bar / footer markup. There is no shared layout, so any footer change is a six-file edit.

**Three declared notification types never fire.** `CHECK_IN_DUE`, `NEW_MESSAGE`, and `NEW_RESPONSE` exist in `NOTIFICATION_TYPES` (`lib/services/notification.service.ts`) and are never constructed anywhere.

**Important events are entirely silent.** `actions/message-actions.ts` broadcasts new messages over Pusher only — a client with no open tab learns nothing. `actions/checkin-actions.ts` neither notifies nor emails on assign or submit. `actions/voice-memo-actions.ts` creates voice memos while `lib/email/templates/voice-memo-added.tsx` sits unimported. `actions/feedback-actions.ts` responds to feedback silently. And every branch of `app/api/stripe/webhook/route.ts` — `invoice.payment_failed`, `customer.subscription.deleted`, `charge.refunded` — mutates subscription state and tells nobody.

**Session reminders have never run in production.** `/api/reminders` is not listed in `vercel.json`, whose crons are only `mark-missed-sessions`, `retry-program-purchases`, and `nutrition-nudges`. The reminder email is dead code today.

**There is no way to opt out.** `prisma/schema.prisma` has no notification-preference model and no field matching `emailNotif`, `notifyBy`, `preference`, or `unsubscrib`. No email carries an unsubscribe link. Adding email to a further dozen events — including a daily nutrition nudge — without an opt-out is both a spam problem and, for non-transactional mail, a legal one.

## 2. Goals and non-goals

**Goals**

1. One dispatcher. A call site states what happened; the registry decides whether that becomes an email.
2. Email delivery can never break the action that triggered it.
3. Every user can mute any category of email from a settings screen or one click in a footer.
4. No user receives a flood. Volume is capped per type by construction, not by convention.
5. The in-app notification is never suppressed, whatever the email preferences say.

**Non-goals**

- No queue, outbox table, or retry logic. Considered and rejected as premature; revisit if delivery failures prove to matter.
- No daily digest email. The cooldown covers the volume problem at a fraction of the cost.
- No per-type toggles. Four categories, deliberately.
- No SMS or push. Email and in-app only.
- No change to the `Notification` model, the notification bell UI, or `actions/notification-actions.ts`.
- No new visual brand for email. The existing card layout is extracted, not redesigned.

## 3. Architecture

Four layers, each usable and testable without the one above it.

```
call site  ──►  notifyUser()          lib/services/notification.service.ts
                    │
                    ├─► registry      lib/notifications/registry.ts
                    ├─► preferences   lib/services/notification-preference.service.ts
                    └─► sendEmail()   lib/email/send.ts
                                          └─► <EmailLayout>  lib/email/templates/layout.tsx
```

### 3.1 Transport — `lib/email/send.ts`

```ts
export async function sendEmail(args: {
  to: string;
  subject: string;
  react: React.ReactElement;
}): Promise<boolean>;
```

Resolves `from` from `RESEND_FROM_EMAIL` (falling back to `noreply@inmotusrx.com`) in one place. Wraps `getResend().emails.send()` in try/catch, `console.error`s the failure with the recipient and subject, and returns `false`. **It never throws.** This is the only module in the app that calls `getResend()` besides `lib/email/resend.ts` itself.

### 3.2 Layout — `lib/email/templates/layout.tsx`

Extracts the shared chrome and the `styles` object from the six existing templates:

```tsx
<EmailLayout
  title={string}                 // <title> and preheader
  organizationName?={string}     // default "INMOTUS RX"
  greeting={string}              // "Hi Sarah,"
  intro={string}
  details?={Array<{ label: string; value: string }>}
  cta?={{ label: string; href: string }}
  footnote?={string}
  unsubscribe?={{ url: string; categoryLabel: string }}
>
  {children}                     // optional free-form body block
</EmailLayout>
```

The six existing templates (`session-reminder`, `session-completed`, `missed-session`, `program-welcome`, `share-program`, `voice-memo-added`) are rewritten as thin prop-mapping functions over this component, and their private `styles` objects deleted. `DetailRow` moves here.

When `unsubscribe` is omitted the footer renders without the link — this is how transactional mail stays link-free.

### 3.3 Registry — `lib/notifications/registry.ts`

```ts
export type NotificationCategory = "sessions" | "messages" | "nutrition" | "billing";

export interface RegistryEntry<D = Record<string, unknown>> {
  category: NotificationCategory;
  transactional: boolean;              // true → ignores preferences, no unsubscribe link
  template: ((props: D & { unsubscribeUrl?: string }) => React.ReactElement) | null;
  subject: (data: D) => string;        // unused when template is null
  cooldownMinutes: number | null;      // null → no cap
}

export const NOTIFICATION_REGISTRY: Record<NotificationType, RegistryEntry>;
```

`template: null` means in-app only — the type is registered, deliberately emailless, and the completeness test still passes.

| Type | Category | Recipient | Template | Transactional | Cooldown |
|---|---|---|---|---|---|
| `SESSION_REMINDER` | sessions | client | `session-reminder` *(exists)* | no | — ¹ |
| `SESSION_COMPLETED` | sessions | trainer | `session-completed` *(exists)* | no | — |
| `MISSED_SESSION` | sessions | trainer | `missed-session` *(exists)* | no | 1440 |
| `EXERCISE_NOTE` | sessions | trainer | `exercise-note` **new** | no | 60 |
| `NEW_MESSAGE` | messages | recipient | `new-message` **new** | no | 60 |
| `CHECK_IN_DUE` | messages | client | `check-in-assigned` **new** | no | — |
| `NEW_RESPONSE` | messages | trainer | `check-in-response` **new** | no | 60 |
| `VOICE_MEMO` **new** | messages | recipient | `voice-memo-added` *(exists, orphaned)* | no | 60 |
| `FEEDBACK_RESPONSE` **new** | messages | client | `feedback-response` **new** | no | — |
| `NUTRITION_COMMENT` | nutrition | client | `nutrition-comment` **new** | no | 60 |
| `NUTRITION_REPLY` | nutrition | trainer | `nutrition-comment` *(reused)* | no | 60 |
| `NUTRITION_NUDGE_MEALS` | nutrition | client | `nutrition-nudge` **new** | no | 1440 |
| `NUTRITION_NUDGE_PROTEIN` | nutrition | client | `nutrition-nudge` *(reused)* | no | 1440 |
| `NUTRITION_NUDGE_WATER` | nutrition | client | `nutrition-nudge` *(reused)* | no | 1440 |
| `PAYMENT_FAILED` **new** | billing | trainer | `payment-failed` **new** | **yes** | — |
| `SUBSCRIPTION_CANCELED` **new** | billing | trainer | `subscription-canceled` **new** | **yes** | — |
| `REFUND_PROCESSED` **new** | billing | client | `refund-processed` **new** | **yes** | — |

¹ `SESSION_REMINDER` needs no cooldown because `app/api/reminders/route.ts` already dedupes per session via `metadata.sessionId`. That existing check is preserved unchanged.

Ten new templates; four existing templates reused as-is (through the new layout); the three nudge types and `NUTRITION_REPLY` share templates with a sibling type.

One wrinkle in the reused set: `voice-memo-added.tsx` currently computes its own subject line internally (`${senderName} left you a voice note` vs `${senderName} left a voice note`, branching on `role`). That branch moves into the registry's `subject(data)` function during the rewrite, so subject text lives in exactly one place for every type. No other existing template does this.

**Five new constants** are added to `NOTIFICATION_TYPES`: `VOICE_MEMO`, `FEEDBACK_RESPONSE`, `PAYMENT_FAILED`, `SUBSCRIPTION_CANCELED`, `REFUND_PROCESSED`.

### 3.4 Preferences

```prisma
model NotificationPreference {
  id           String   @id @default(auto()) @map("_id") @db.ObjectId
  userId       String   @unique @db.ObjectId
  user         User     @relation("NotificationPreference", fields: [userId], references: [id])
  emailEnabled Boolean  @default(true)
  sessions     Boolean  @default(true)
  messages     Boolean  @default(true)
  nutrition    Boolean  @default(true)
  billing      Boolean  @default(true)
  unsubToken   String   @unique
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

Plus `notificationPreference NotificationPreference? @relation("NotificationPreference")` on `User`. MongoDB via `prisma db push`, so no migration file.

`lib/services/notification-preference.service.ts`:

```ts
const DEFAULTS = { emailEnabled: true, sessions: true, messages: true, nutrition: true, billing: true };

getPreference(userId): Promise<Preference>            // row, or DEFAULTS when absent
getOrCreatePreference(userId): Promise<Preference>     // creates row + unsubToken
isEmailAllowed(userId, type): Promise<boolean>         // transactional → always true
updatePreference(userId, patch): Promise<void>         // upserts; ignores `billing`
resolveUnsubToken(token): Promise<Preference | null>
```

**No backfill.** `getPreference` returns `DEFAULTS` when no row exists, so every existing user is opted in without writing anything. A row is created lazily on the first settings save or the first unsubscribe click. `unsubToken` is `crypto.randomBytes(32).toString("hex")`, generated at row creation.

`updatePreference` silently drops any `billing` value it is passed. Billing is transactional at the registry level; accepting the field would imply a control that does not exist.

### 3.5 Dispatcher — `notifyUser()`

Added to `lib/services/notification.service.ts`. `createNotification` stays exactly as it is, as the in-app-only primitive.

```ts
export interface NotifyUserInput extends CreateNotificationInput {
  type: NotificationType;                  // narrowed from string
  email?: Record<string, unknown>;         // extra props for the template
  recipientEmail?: string;                 // skips the User lookup when the caller has it
}

export async function notifyUser(input: NotifyUserInput): Promise<void>;
```

Sequence:

1. `createNotification(input)` — **always, unconditionally, first.**
2. Look up `NOTIFICATION_REGISTRY[input.type]`. Missing entry → `console.error` and return (the in-app notification is already saved). `template === null` → return.
3. `isEmailAllowed(userId, type)` → false → return.
4. `cooldownMinutes !== null` → query `Notification` for a row with the same `userId` and `type` and `createdAt >= now - cooldown`, **excluding the row just created in step 1**. A hit → return.
5. Resolve the recipient address: `input.recipientEmail`, else `prisma.user.findUnique({ where: { id: userId }, select: { email: true, firstName: true } })`. No address → return.
6. Build `unsubscribeUrl` (omitted for transactional types), render the template with `{ ...input.email, ...recipientFields, unsubscribeUrl }`, and `await sendEmail(...)`.

Steps 2–6 are wrapped in a single try/catch that logs `type` and `userId`. Combined with `sendEmail` never throwing, **`notifyUser` never throws.** A caller cannot fail because of email.

Email is sent inline (awaited) rather than deferred, so behavior is deterministic and testable. The one exception is `app/api/stripe/webhook/route.ts`, where sends go inside the existing `after()` pattern so Stripe still receives a fast acknowledgement.

## 4. Call-site changes

Each of these replaces `createNotification` with `notifyUser` and adds an `email` payload, or adds a `notifyUser` call where there was nothing. No business logic changes.

### 4.1 Migrations — existing behavior, new plumbing

| File | Change |
|---|---|
| `app/api/reminders/route.ts` | Inline `emails.send` + `createNotification` → one `notifyUser`. `metadata.sessionId` dedup preserved. Local `getResend`/`React`/template imports dropped. |
| `actions/session-v2-actions.ts` | `notifyTrainerOnCompletion` → `notifyUser`, deleting the unguarded `emails.send` (the outage-breaks-workouts bug). `notifyTrainerOfClientNotes` → `notifyUser`, so `EXERCISE_NOTE` gains email. |
| `actions/compliance-actions.ts` | Builds its notification with a raw `prisma.notification.create` (:85) rather than the service helper; that plus the guarded send at :102 collapse into one `notifyUser`. The `createComplianceAlert` helper in `lib/services/notification.service.ts` has **no callers anywhere** — it is dead code and is deleted rather than migrated. |
| `actions/program-actions.ts` | Share-program send at :991 → `sendEmail`. **Stays outside the dispatcher** — the recipient is an email address, possibly not a user, so there is no `userId` to notify or preference to consult. This is the one flow where a send failure *should* reach the user, since they clicked Share and are waiting: the action keeps returning `{ success: false }` on a falsy `sendEmail` result. |
| `lib/email/send-program-welcome.ts` | → `sendEmail` + `EmailLayout`. Also stays outside the dispatcher: it fires during `fulfillProgramPurchase` before the account is usable. Because `sendEmail` cannot throw, this alone fixes the spurious-FAILED bug in §1. |

### 4.2 New events

| File | Change |
|---|---|
| `actions/message-actions.ts` | `sendMessageAction` → `NEW_MESSAGE` to `recipientId`, **skipped when `isInternal`** (trainer-only notes must not email the client). `replyToClientNoteAction` → `NEW_MESSAGE` to `log.session.clientId`. `sendBroadcastMessageAction` → one `notifyUser` per recipient via `Promise.allSettled`; the 60-minute cooldown applies per user. |
| `actions/checkin-actions.ts` | `assignCheckInAction` → `CHECK_IN_DUE` to `clientId`. `submitCheckInResponseAction` → `NEW_RESPONSE` to `assignment.trainerId` (the response's `assignmentId` resolves to a `CheckInAssignment`, which carries `trainerId`). |
| `actions/voice-memo-actions.ts` | `confirmVoiceMemoUpload` → `VOICE_MEMO`, finally using `voice-memo-added.tsx`. The recipient is the counterparty by author role: a `TRAINER` author notifies `workout.program.client`, a `CLIENT` author notifies `workout.program.trainer`. Both are already loaded with `id`/`email`/`firstName`/`lastName` by the existing query, so no extra lookup is needed, and `recipientEmail` can be passed directly. The template's `role` prop is the **recipient's** role, not the author's. |
| `actions/feedback-actions.ts` | `respondToFeedbackAction` → `FEEDBACK_RESPONSE` to the submitting client. |
| `actions/nutrition-actions.ts` | Sites at :268 and :286 swap `createNotification` → `notifyUser`. |
| `app/api/cron/nutrition-nudges/route.ts` | The `Promise.all(notifications.map(createNotification))` at :116 becomes `notifyUser`. 1440-minute cooldown makes a double-fire harmless. |
| `app/api/stripe/webhook/route.ts` | `invoice.payment_failed` → `PAYMENT_FAILED` to the trainer. `customer.subscription.deleted` → `SUBSCRIPTION_CANCELED` to the trainer. `charge.refunded` → `REFUND_PROCESSED` to the purchasing client. All three inside `after()`. Each needs a `TrainerSubscription`/`ProgramPurchase` → `User` lookup that the current code does not perform. |

### 4.3 Configuration

`vercel.json` gains a fourth cron so reminders actually run:

```json
{ "path": "/api/reminders", "schedule": "0 9 * * *" }
```

`CRON_SECRET` is already respected by the route (and only enforced when set).

## 5. Unsubscribe and settings

### 5.1 `app/api/notifications/unsubscribe/route.ts`

`GET ?token=<hex>&category=<sessions|messages|nutrition>`. No authentication — the token is the credential, so the link works from any mail client with no session.

- Valid token + valid category → that category set `false`.
- Valid token, no category → `emailEnabled` set `false`.
- Missing, malformed, or unknown token → a neutral "this link is invalid or expired" page. It never reveals whether an address is registered.
- `category=billing` is rejected as invalid, since billing mail carries no link.

Returns a minimal self-contained HTML confirmation: what was muted, that the notification remains visible in-app, and a link to `/settings/notifications`.

### 5.2 `/settings/notifications`

New page at `app/(platform)/settings/notifications/page.tsx`, following the existing `settings/clinic` and `settings/billing` pages. A client component `components/settings/notification-preferences-form.tsx` and `actions/notification-preference-actions.ts` (`getMyPreferenceAction`, `updateMyPreferenceAction`).

Layout: a master **Email notifications** switch, then the four categories with one-line descriptions. Turning the master off visually disables the four below. **Billing renders disabled** with the explanatory line "Always sent — required for account access", because the dispatcher ignores it and a working toggle would be a lie.

Same screen for trainers and clients; the categories simply fire on different events per role. Semantic design tokens only — `lib/ui/status.ts` roles and existing UI primitives, no raw palette classes, per the `no-raw-palette` ESLint rule.

## 6. Error handling

| Failure | Behavior |
|---|---|
| `RESEND_API_KEY` unset | `getResend()` throws inside `sendEmail`, caught, logged once per send, returns `false`. In-app notification and caller unaffected. |
| Resend API error or timeout | Same. No retry — the in-app notification is the durable record. |
| Template render throws | Caught by the `notifyUser` try/catch. Notification already persisted. |
| Recipient has no email | Logged and skipped. |
| Type missing from registry | `console.error` naming the type; in-app notification still created. The completeness test exists to make this unreachable. |
| Preference lookup fails | Caught; email skipped. Failing closed is correct — never email on an unknown preference. |

The invariant throughout: **the in-app notification is the source of truth, and email is best-effort.** Muting email, hitting a cooldown, or a total Resend outage never costs a user information.

## 7. Testing

Vitest is configured; tests live in `actions/__tests__` and `lib/services/__tests__`.

**New — `lib/notifications/__tests__/registry.test.ts`**
- Every value in `NOTIFICATION_TYPES` has a `NOTIFICATION_REGISTRY` entry, and vice versa. This is the guard against future drift.
- Every non-null `template` has a `subject`; every `billing` entry is `transactional`; no non-billing entry is.

**New — `lib/services/__tests__/notification-preference.service.test.ts`**
- `getPreference` returns defaults for a user with no row, without writing one.
- `getOrCreatePreference` generates a unique `unsubToken`.
- `isEmailAllowed` is false when the category is muted, false when `emailEnabled` is false, and **true for a transactional type even when both are false**.
- `updatePreference` drops an attempted `billing: false`.
- `resolveUnsubToken` returns null for an unknown token.

**New — `lib/services/__tests__/notify-user.test.ts`**
- In-app notification is created even when email is muted, cooldown-suppressed, and when `sendEmail` rejects.
- Cooldown suppresses a second email but not a second notification; a notification older than the window does not suppress.
- The row created in step 1 does not suppress its own email.
- `template: null` creates the notification and sends nothing.
- A `sendEmail` failure leaves `notifyUser` resolved, not rejected.
- Unsubscribe URL is present for non-transactional and absent for transactional.

**New — `app/api/notifications/__tests__/unsubscribe.test.ts`** — valid token/category mutes one category; no category mutes globally; bad token returns the neutral page and writes nothing; `category=billing` rejected.

**Updated** — `actions/__tests__/session-v2-actions.test.ts` and `actions/__tests__/nutrition-actions.test.ts` mock `createNotification` and must mock `notifyUser`. `actions/__tests__/voice-memo-actions.test.ts` mocks `getResend` and needs the new expectation. Each currently mocks `getResend` directly; those mocks move to `@/lib/email/send`.

**Not tested automatically:** rendered email appearance. One manual pass through Resend's dashboard against the ten new templates before enabling production sends.

## 8. Implementation phases

Ordered so each phase leaves the app working and the risky parts land behind the safe ones.

1. **Foundation** — `sendEmail`, `EmailLayout`, rewrite the six existing templates, registry with the twelve existing types, `NotificationPreference` model + `db push`, preference service, `notifyUser`, registry/preference/dispatcher tests.
2. **Migrate the five existing sends** onto the new layer, and delete the dead `createComplianceAlert`. No user-visible change; proves the dispatcher against known-good flows and fixes both unguarded-throw bugs from §1.
3. **Preferences surfaced** — unsubscribe route and `/settings/notifications`. Must precede any new email so the opt-out exists before the volume does.
4. **Messaging and check-ins** — five new types/sites, four new templates.
5. **Nutrition** — five sites onto the dispatcher, two new templates.
6. **Billing** — three Stripe branches, three new templates, the recipient lookups.
7. **Cron and environment** — `/api/reminders` added to `vercel.json`; confirm `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL` in production.

## 9. Risks and accepted trade-offs

- **Cooldown is racy.** Two messages sent in the same instant can both pass step 4 and both email. Accepted: the failure mode is one extra email, and the alternative is a lock or unique index for no real gain.
- **No delivery guarantee.** A send lost to a Resend outage is gone; only the in-app notification survives. Accepted per the no-queue non-goal.
- **Broadcast to a large roster** issues one Resend call per recipient. Fine at current scale; if rosters grow, batch via Resend's bulk endpoint.
- **`Notification` row count grows** now that more events write one. The existing `@@index([userId, isRead, createdAt])` covers both the bell query and the cooldown lookup.
- **Billing mail cannot be muted.** Deliberate, and stated in the UI. If a trainer complains, the fix is narrowing which billing events are transactional, not adding a toggle.

## 10. Open questions

**Resend provisioning is unverified and blocks phase 7.** `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are absent from `.env` and `.env.local` (both hold only `NEXT_PUBLIC_APP_URL`), and the repo is not linked to a Vercel project, so production values could not be inspected. Needed before production sends:

1. A Resend account with `inmotusrx.com` verified as a sending domain (SPF + DKIM), so `noreply@inmotusrx.com` is deliverable.
2. `RESEND_API_KEY` and `RESEND_FROM_EMAIL` set for Preview and Production.

If no account exists, provision Resend through the Vercel Marketplace integration rather than hand-managing the key. Phases 1–6 can be built and tested against a mocked `sendEmail` without it.
