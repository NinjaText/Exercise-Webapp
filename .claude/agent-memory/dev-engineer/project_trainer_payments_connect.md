---
name: project-trainer-payments-connect
description: Trainer payments (Stripe Connect, spec §3 of 2026-10-22 follow-along/reflections/payments design) built 2026-10-22 on club-orgs, uncommitted; rollout gates
metadata:
  type: project
---

Stripe Connect trainer payments built 2026-10-22 (uncommitted, branch club-orgs). Direct charges on the trainer's account, no fee; separate `/api/stripe/connect/webhook` + `STRIPE_CONNECT_WEBHOOK_SECRET`; platform webhook now ignores any event with `event.account`. Offer fulfillment retries piggyback on `/api/cron/retry-program-purchases` (no new vercel cron).

**Why:** client request doc 2026-10-21; MIA billing must stay separate; clubs never get payments (server-enforced via `lib/payments/payments-access.ts`).

**How to apply:** rollout needs user `prisma db push`, Connect enabled in Stripe, Connect webhook endpoint ("Events on Connected accounts", 10 events), optional `STRIPE_CONNECT_CLIENT_ID` — see docs/payments/stripe-connect-setup.md. Service/webhook tests use the in-memory `lib/payments/__tests__/fake-db.ts` (real services, asserts rows) — reuse it for new payment tests. Revenue analytics now read OfferPurchase/OfferSubscription (membership revenue is an estimate). Related: [[patterns-payment-model]].
