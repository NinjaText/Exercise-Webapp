# Rollout: pricing page, 7-day card trials, Individuals, AI limits

Order matters: the env vars and database changes must go live **with** the new
code, not before (today's production code would otherwise charge new prices
under the old 14-day, no-card flow).

Every step that talks to Stripe needs a connection that can reach
`api.stripe.com` (it times out from the office network — use a VPN).

## 1. Test locally first (Stripe test mode)

1. `mongod --dbpath ~/mia-test-db/data --port 27018 --replSet rs0` (local test DB).
2. `npx prisma db push` (local DB only — `.env.local` points at 127.0.0.1:27018).
3. `npx tsx scripts/create-stripe-prices.ts` with the **test** key. Trainer
   checkout finds these prices in Stripe by lookup key — nothing to paste into env.
4. `stripe listen --api-key $STRIPE_SECRET_KEY --forward-to localhost:3005/api/stripe/webhook`
   → put the printed `whsec_…` in `.env.local` as `STRIPE_WEBHOOK_SECRET`.
5. `npx next dev -p 3005`, then in Admin → Clubs create **MIA Individuals**
   ($39.99, 7-day trial, "Require a card" + "Open join" on, starter programs),
   and set `INDIVIDUALS_CLUB_SLUG` in `.env.local` to its join slug.
6. Click through with card `4242 4242 4242 4242`:
   - `/pricing` → Trainers → Starter → sign up → organization → Stripe → app (trialing);
     Settings → Billing shows trial end + first charge.
   - `/pricing` → Individuals → Starter → join → profile → Stripe → app.
   - Invite an 11th client on Starter → blocked with "Upgrade plan".
   - Admin → AI Usage → set a trainer's custom limit to 0 → "Generate program" is refused.

## 2. Production (same day as the deploy)

1. `npx tsx scripts/create-stripe-prices.ts` with the **live** key. Trainer
   prices are found by lookup key, so no price env vars; the old
   `STRIPE_PRICE_*` vars in Vercel are no longer read and can be deleted
   after the deploy. Existing subscribers keep their stored plan and price.
2. Vercel (team "Sharon's projects", project `exercise-webapp`), Production env:
   - `NEXT_PUBLIC_CALENDLY_URL` → Sharon's booking link.
   - `INDIVIDUALS_CLUB_SLUG` → set after step 5.
3. Merge + deploy.
4. `npx prisma db push` against production, from the deployed commit (adds
   optional fields + 4 AI usage collections; nothing is removed).
5. Admin → Clubs → create **MIA Individuals** (as above, live price), then set
   `INDIVIDUALS_CLUB_SLUG` and redeploy.
6. Stripe Dashboard (live) → Settings → Billing → Customer portal: allow
   cancel (at end of period), switching between the 3 trainer prices, and
   updating the payment method. Check the webhook endpoint sends
   `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_failed`.
7. Admin → AI Usage → set the real per-plan allowances once decided
   (placeholders: 500k / 1.5M / 5M tokens).
