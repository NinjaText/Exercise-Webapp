# Trainer payments — Stripe Connect setup

Trainers sell programs (one-time) and coaching memberships (monthly) to their
own clients. Every charge is a **direct charge on the trainer's connected
Stripe account**: the money, the customer, receipts, refunds, disputes and
payouts all live in the trainer's Stripe account. MIA takes **no commission**
(`PLATFORM_FEE_BPS = 0` in `lib/payments/connect-config.ts`; no
`application_fee_amount` is ever sent).

This is completely separate from MIA's own billing (trainer plans, club
memberships, the `/p/<slug>` funnel), which keeps using `/api/stripe/webhook`
and `STRIPE_WEBHOOK_SECRET`. Clubs (`billing === "member"`) never see
payments: `/payments` and `/store` are hidden in the nav **and** refused
server-side.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | yes (already set) | The platform key. Connect calls use it with `{ stripeAccount }`. |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | **yes** | Signing secret of the Connect webhook endpoint (`whsec_…`). The endpoint returns 500 until it is set. |
| `STRIPE_CONNECT_CLIENT_ID` | optional | Connect OAuth client id (`ca_…`). Enables the "Connect an existing Stripe account" button; hidden when unset. |
| `NEXT_PUBLIC_APP_URL` | yes (already set) | Base for onboarding return/refresh URLs, the OAuth redirect URI and Checkout success/cancel URLs. |
| `CLERK_SECRET_KEY` | yes (already set) | Used to derive the HMAC key that signs the OAuth `state`. |
| `CRON_SECRET` | yes (already set) | The existing `/api/cron/retry-program-purchases` cron now also retries Connect fulfillment. |

Set test-mode values in Preview/Development and live-mode values in
Production, the same way as the other Stripe keys.

## 1. Enable Connect

1. Stripe Dashboard → **Connect** → *Get started*. Choose the platform
   profile ("Platform or marketplace"), and when asked about account types,
   allow accounts where **the connected account pays Stripe fees** and
   **Stripe is responsible for negative balances** (MIA creates accounts with
   `controller: { stripe_dashboard: { type: "full" }, fees: { payer: "account" }, losses: { payments: "stripe" }, requirement_collection: "stripe" }` —
   Standard-like accounts with the full Stripe Dashboard).
2. Complete the platform profile / branding (name, icon, color) under
   **Connect → Settings → Branding**; trainers see it during onboarding.
3. Do this in **test mode first**, then repeat in live mode.

## 2. (Optional) OAuth for existing Stripe accounts

1. **Connect → Settings → Onboarding options → OAuth**: enable OAuth for
   Standard accounts.
2. Add the redirect URI: `https://<your app host>/payments/oauth/callback`
   (add `http://localhost:3000/payments/oauth/callback` in test mode for local
   dev).
3. Copy the **client id** (`ca_…`) into `STRIPE_CONNECT_CLIENT_ID`.

Without it, trainers can still use an existing Stripe login: the hosted
onboarding started by "Set up payments with Stripe" lets them sign in.

## 3. Create the Connect webhook endpoint

Stripe Dashboard → **Developers → Webhooks → Add endpoint**:

- **Endpoint URL**: `https://<your app host>/api/stripe/connect/webhook`
- **Listen to**: **Events on Connected accounts** (not "Events on your
  account" — that is the existing `/api/stripe/webhook` endpoint; keep the two
  separate).
- **Events**:
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - `checkout.session.async_payment_failed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.paid`
  - `invoice.payment_failed`
  - `charge.refunded`
  - `charge.dispute.closed`
  - `account.updated`
  - `account.application.deauthorized`
- Copy the endpoint's **Signing secret** into `STRIPE_CONNECT_WEBHOOK_SECRET`.

The route ignores (200) events without `event.account`, events from accounts
MIA doesn't know (a trainer's current account, or a previous one their offers
were sold on), objects whose metadata isn't `purchaseType: "connect_offer"`,
and objects whose `clientId` isn't a CLIENT in the trainer's org (trainers
control their own Stripe account, so metadata is never trusted alone). Handlers are idempotent; a thrown error
returns 500 so Stripe retries. The platform webhook ignores any event that
carries `event.account`.

## 4. Database

The Prisma models `ConnectedAccount`, `PaidOffer`, `OfferPurchase` and
`OfferSubscription` must exist in the database: run `npx prisma db push`
yourself before deploying (never from an agent session — `DATABASE_URL` is
production).

## 5. Test-mode walkthrough

Local webhook forwarding (Stripe CLI):

```bash
stripe listen --forward-connect-to localhost:3000/api/stripe/connect/webhook
# put the printed whsec_… in STRIPE_CONNECT_WEBHOOK_SECRET for local dev
```

1. **Trainer onboarding** — sign in as a trainer (trainer org, not a club) →
   **Payments** → *Set up payments with Stripe*. In Stripe's test onboarding
   use the test values it offers (e.g. phone `000-000-0000`, SMS code
   `000000`, SSN `000-00-0000`, routing `110000000`, account `000123456789`).
   You return to `/payments?onboarding=return`; the card shows *Accepting
   payments* once `charges_enabled` is true (refreshed live on every visit and
   by `account.updated`).
2. **Offers** — *New offer*: a Program (pick a template) and a Coaching
   membership (optional program, cancellation policy). Products/prices appear
   in the trainer's test dashboard (switch to the connected account).
3. **Client purchase** — sign in as a client of that trainer → **Store** →
   *Buy now*. Pay with `4242 4242 4242 4242`. The success page polls until the
   program copy is assigned; it appears under Programs. The trainer gets a
   "Payment received" notification and the sale shows under Payments.
4. **Async failure** — pay with a delayed-notification method (e.g. US bank
   account test numbers that fail) to exercise
   `checkout.session.async_payment_failed` → purchase FAILED + notifications.
5. **Membership** — *Subscribe* to the coaching offer. The membership shows
   *Active* on the Store and under the trainer's Memberships tab; its program
   (if any) is assigned. Cancel from the Store:
   - END_OF_PERIOD → "Ending", *Resume* available until the period ends;
   - IMMEDIATE (or a past-due membership) → canceled now, program paused.
6. **Failed renewal** — use card `4000 0000 0000 0341` (attaches, then fails)
   and advance a test clock, or trigger
   `stripe trigger invoice.payment_failed --stripe-account acct_…` → PAST_DUE +
   notifications.
7. **Refund** — refund the program charge fully from the trainer's Stripe
   Dashboard → purchase REFUNDED, program paused, client notified. Partial
   refunds leave access alone.
8. **Disconnect** — *Disconnect* on `/payments` (or revoke the app from the
   connected account's dashboard → `account.application.deauthorized`):
   offers are hidden from clients; existing memberships keep billing on the
   trainer's account until canceled there.

## Operational notes

- **Fulfillment retries**: program cloning runs in `after()`; failures set
  `fulfillmentStatus = FAILED`. `/api/cron/retry-program-purchases` (every 5
  minutes, already in `vercel.json`) retries them and reconciles PENDING
  purchases older than 5 minutes against Stripe (a missed webhook), marking
  expired checkouts FAILED.
- **Currency**: offers are priced in USD (`OFFER_CURRENCY`).
- **Analytics**: "Revenue this month" = paid program sales in the month + one
  monthly charge per membership that was ever activated (`activatedAt`) and
  billed in the month (estimate at the offer's current price). "Programs sold" = paid program purchases.
- **Price changes** create a new Stripe Price; existing members keep their
  original price.
- **Refunds / disputes**: a full refund or a lost dispute (`charge.dispute.closed`
  with status `lost`) moves the purchase to REFUNDED (even while still
  PENDING) and pauses the program; before anything is marked paid, the
  PaymentIntent's latest charge is checked for a refund.
- **Membership states**: Stripe `unpaid`/`paused` → PAUSED (program paused,
  resumed when the subscription is active again); `past_due` keeps access
  while Stripe retries.
- **Duplicates**: starting a checkout expires the client's earlier open
  checkout for the same offer; Stripe is checked for an existing membership
  first. A second live membership that still slips through is canceled on
  the trainer's account by the webhook (the trainer refunds that charge); a
  second paid program purchase is not cloned again (refund it in Stripe).
- **Disconnect / deauthorize**: once MIA's access is revoked no more events
  arrive, so live memberships on that account are ended in MIA and their
  programs paused (the subscriptions keep running in Stripe until the trainer
  cancels them). `/payments` warns about memberships on an account that is no
  longer connected. Connecting a different account via OAuth is refused while
  one is live.
- New accounts are created without an explicit `country`, so Stripe uses the
  platform's country. Trainers outside it should connect an existing account
  via OAuth (or this can be extended with a country picker).
