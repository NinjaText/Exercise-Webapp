# Referral & Commission Management — Design

2026-11-11 · from client doc "REFERALL_.docx". Decisions marked **(call)** are mine, not the client's — revisit if they disagree.

## Goal

Contractors (sales reps / affiliates) get a unique referral link + code. MIA tracks the trainers and individuals they bring in, verifies payment with Stripe, and earns them commissions per a compensation plan the super admin edits in `/admin/referrals` — no code changes. Rate changes only apply to future referrals.

## Concepts

| Thing | What it is |
|---|---|
| **Contractor** | Admin-managed person (not an app login) **(call)**. Has a unique `referralCode`, an assigned **Commission plan**, active/inactive flag, link-click counter. |
| **Commission plan** | Reusable named terms. Different contractors can be on different plans; a one-off "custom" plan for one contractor is just another plan. |
| **Referral** | One referred account (`referredUserId` unique — first attribution wins). Type `TRAINER` or `INDIVIDUAL` (self-serve club member, e.g. MIA Individuals). Carries a **snapshot of the terms** at the moment of referral. |
| **Commission** | A ledger row: `SIGNUP`, `RETENTION_BONUS`, or `ADJUSTMENT` (manual, may be negative). Status `UNPAID → PAID` (via payout) or `VOID`. |
| **Payout** | Admin records "paid $X to contractor via <method>, ref <txn>" covering a set of unpaid commissions. Can be reversed (commissions go back to unpaid). |

## Plan terms

- **Signup commission**, separately for trainers and individuals: `NONE` · `FIXED` (cents) · `PERCENT` (basis points of the first paid invoice).
- **Retention bonus**: `$bonus` for every `N` referrals retained `M` months, counting `TRAINERS`, `INDIVIDUALS` or `ALL`. E.g. $200 / 4 trainers / 2 months.

## No retroactive changes

At attribution the referral copies the plan's applicable terms (commission type/value, retention bonus/count/months) onto itself. All later math reads the referral's snapshot, never the live plan. Editing a plan or moving a contractor to another plan only affects referrals attributed afterwards. Earned commission rows are never recalculated.

Retention bonuses pool referrals with **identical retention terms** for the same contractor, so a referral made under "$200 / 4 / 2mo" never mixes with one under "$300 / 5 / 3mo".

## Attribution

- Link: `https://www.miaperformance.com/r/<CODE>` → counts a click, sets the `mia_ref` cookie (60 days, last click wins) and redirects to `/get-started` (or a whitelisted `?to=` page).
- Code: optional "Referral code" field on `/sign-up` and club `/join/<slug>` sign-up (pre-filled from the cookie, validated live). Saved to Clerk `unsafeMetadata.referralCode`. Typed code beats cookie.
- Applied at **trainer onboarding** (`completeTrainerOnboarding`) and **club join** (`/join/<slug>/complete`). Skipped for: billing-exempt accounts, free clubs, accounts that already had a Stripe subscription, self-referral (contractor email = user email), inactive contractors. Attribution never blocks sign-up (errors are logged).

## Stripe verification

- `invoice.paid` on the platform webhook → resolve customer → trainer/member → referral. Only invoices with `amount_paid > 0` count ("paying subscriber"); coaching invoices on a member's customer are ignored. Trials ($0) don't count.
- First paid invoice → referral `CONVERTED`, `SIGNUP` commission created (idempotent by `signup:<referralId>`).
- Every paid invoice increments the referral's paid count / total (deduped by invoice id).
- Daily cron `/api/cron/referral-retention` (also "Recalculate now" in admin):
  1. **Missed-payment backfill**: referrals not yet converted whose subscription is live → list paid invoices from Stripe and apply them (covers a missed or unsubscribed webhook).
  2. **Churn**: subscription canceled / account deleted → `CHURNED` (a later payment re-converts and restarts the retention clock).
  3. **Retention**: `CONVERTED` referral whose `retentionStartAt + M months` has passed → subscription retrieved **from Stripe** must be `active` → `RETAINED`.
  4. **Bonuses**: per contractor + identical terms, every full group of `N` retained, un-bonused referrals → one `RETENTION_BONUS` commission (idempotent by a key over the grouped referral ids).

No Mongo transactions are used anywhere in the app; idempotency comes from unique `sourceKey`s + compare-and-set `updateMany`, so retries and concurrent runs are safe.

**(call)** Refunds don't auto-void commissions (Stripe's newer invoice-payment model makes charge→invoice mapping brittle). Admin voids unpaid commissions or adds a negative adjustment for a clawback.

## Admin UI (`/admin/referrals`)

- **Overview**: totals (referrals, paying, earned, unpaid balance, paid out, in retention window) + contractors table + recent commissions; Add contractor; Recalculate now.
- **Contractor detail**: link/code copy, plan selector, stats, retention-bonus progress per terms group, referrals table (subscriber, type, live subscription status, first payment, commission), commissions (void, add adjustment), payouts (record, reverse).
- **Plans**: create / edit / archive with a live plain-English summary ("$200 for every 4 trainers retained 2 months").
- **Payouts**: full payout history across contractors.

All mutations are super-admin only and audit-logged (Payments category).

## Rollout

1. `npx prisma db push` (new collections only; no change to existing models).
2. Stripe dashboard → platform webhook endpoint → add the **`invoice.paid`** event.
3. Deploy (cron added to `vercel.json`).
4. Create plans → contractors → share links.

## Out of scope / follow-ups

- Contractor self-serve portal/login (admin-only for now).
- Automatic payouts (Stripe Connect transfers) — payouts are recorded manually.
- Recurring % of every payment (only first-payment commissions + retention bonuses were asked for).
