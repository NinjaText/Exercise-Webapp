# Inmotus RX mobile — known issues and open decisions

Sources:

- the execution records at the end of [`2026-09-26-mobile-native-shell.md`](../superpowers/plans/2026-09-26-mobile-native-shell.md), [`2026-09-26-mobile-store-rules.md`](../superpowers/plans/2026-09-26-mobile-store-rules.md), [`2026-09-26-mobile-push-notifications.md`](../superpowers/plans/2026-09-26-mobile-push-notifications.md) and [`2026-09-27-mobile-trainer-phone-pass.md`](../superpowers/plans/2026-09-27-mobile-trainer-phone-pass.md);
- the web-foundation plan's verification notes;
- items found while writing the release docs, marked *(found in Plan 5)*.

Ranking:

- **Blocker**: fix or decide before submitting to either store.
- **Should fix**: real user or review risk; fix soon, ideally before submission.
- **Later**: known and accepted for v1.

## Blockers for store submission

| # | Issue | Evidence | What to do |
|---|---|---|---|
| B1 | **The "HIPAA Compliant · SOC 2 Type II" badge**, and the "HIPAA-ready" / "HIPAA BAA included" claims, are on the public site. Apple and Google can see them through the marketing URL, and they are legal claims about how health data is handled | [`components/layout/site-footer.tsx`](../../components/layout/site-footer.tsx) line 48 (footer on `/` and `/about`); `app/page.tsx` lines 35 and 165. Not shown inside the app (the landing page redirects on native; the legal pages drop the footer on native) | Keep them only if they are true and you can evidence them (signed BAAs with every processor that touches health data, a completed SOC 2 Type II report). Otherwise remove them before submission. *(found in Plan 5)* |
| B2 | **Third-party AI disclosure and consent (Apple 5.1.2(i)).** OpenAI receives meal photos (client "AI Photo"). It also receives client names, adherence and feedback (trainer dashboard insights, fetched automatically), and client diagnosis, limitations and pain score (program generation). The privacy policy says only "AI model providers" and names none. The app asks no consent | `lib/services/nutrition-ai.service.ts`; `lib/services/dashboard-ai-insights.service.ts`; `lib/services/ai.service.ts`; [`lib/legal/privacy-policy.ts`](../../lib/legal/privacy-policy.ts) | Name the AI provider and the data sent in the policy, and add an explicit in-app consent or disclosure before these features send personal data. OWNER TO CONFIRM the approach. *(found in Plan 5)* |
| B3 | **Privacy policy accuracy.** It covers push tokens and processor *categories*, but: (a) it says deletion removes health records and messages, while uploaded meal photos and voice notes stay in R2 (see S2); (b) date of birth, occupation and trainer file uploads are not listed; (c) it names no processors. Submissions must match the store privacy answers in [store-listing.md](store-listing.md) | `lib/legal/privacy-policy.ts`; `lib/services/user-deletion.service.ts` (no R2 calls) | Owner or legal review of the wording against store-listing.md §3–§5 |
| B4 | **Placeholders in [`lib/legal/company.ts`](../../lib/legal/company.ts).** `LEGAL_ENTITY_NAME = "Inmotus RX"` (a brand, probably not the registered legal entity that must match the D-U-N-S record); `LEGAL_GOVERNING_LAW` = Texas; `LEGAL_CONTACT_EMAIL = support@goinmotus.com`. The file itself says to "confirm all three … before the first store submission" | `lib/legal/company.ts` | OWNER TO CONFIRM each value and that the mailbox is monitored |
| B5 | **No support URL.** Apple requires a support URL with contact details. The app has no support or contact page | `app/` routes: about, privacy, terms only | Add a simple support page or use an existing site page with the support email. *(found in Plan 5)* |
| B6 | **No iOS privacy manifest in the app target.** `@capacitor/filesystem` uses file-timestamp APIs (`creationDate` / `modificationDate`), which Apple requires a declared reason for. Only Capacitor core ships a `PrivacyInfo.xcprivacy` | `mobile/node_modules/@capacitor/filesystem/ios/Sources/FilesystemPlugin/IONFileStructures+Converters.swift`; no `*.xcprivacy` under `mobile/ios/App` | Add `PrivacyInfo.xcprivacy` to the App target declaring `NSPrivacyAccessedAPICategoryFileTimestamp` (reason `C617.1`). Then check App Store Connect's email after upload for any other `ITMS-91053` items. OWNER TO CONFIRM the final reason list. *(found in Plan 5)* |
| B7 | **Production Clerk not wired into the release build.** Both local `.env` files hold a development (`pk_test_…`) key, so `npm run sync` adds a `*.clerk.accounts.dev` host and `verify:release` fails, as designed | [`mobile/clerk-host.cjs`](../../mobile/clerk-host.cjs); `mobile/scripts/verify.cjs`; store-rules ruling 7 | Production Clerk instance on `*.goinmotus.com`, production keys in Vercel and on the build Mac ([release-checklist.md](release-checklist.md) §4) |
| B8 | **Placeholder icon and splash** (a plain "RX" mark) | `mobile/resources/`; README §7 | Supply final art, then `npm run assets` |
| B9 | **Demo accounts don't exist, and a new trainer's trial lasts 14 days.** A demo trainer created normally is locked to the attention screen after 14 days, which review can outlast | `actions/onboarding-actions.ts` (`trialEndsAt + 14`); `app/(platform)/layout.tsx` | Create the accounts and seed data ([review-notes.md](review-notes.md) §4). Give the demo trainer a subscription that will not lapse |
| B10 | **Owner setup not yet done:** `npx prisma db push` for `PushDevice` and `NotificationPreference.pushEnabled`; the push env vars; the Firebase Android app and `google-services.json`; the APNs key; `APPLE_TEAM_ID` / `ANDROID_SHA256_CERT_FINGERPRINTS` followed by a redeploy | Push plan owner list; [release-checklist.md](release-checklist.md) §2–§5 | Follow the release checklist |
| B11 | **No device or signed-in QA has run.** Every plan was verified with unit tests and static audits only. The shell was never launched with push, links, the attention screen or the trainer pass on a real phone | All four execution records ("what only the owner can verify") | Run [qa-matrix.md](qa-matrix.md) on TestFlight and on the internal-track build |

## Should fix

| # | Issue | Evidence | Note |
|---|---|---|---|
| S1 | **Super-admin delete doesn't cancel Stripe.** `deleteUserAction` calls `deleteUserData` directly, which removes the `TrainerSubscription` row (the only copy of `stripeSubscriptionId`), so the trainer keeps being billed with no record left. The Clerk `user.deleted` webhook path does the same (for example, a user deleted from the Clerk dashboard) | [`actions/admin-actions.ts`](../../actions/admin-actions.ts) `deleteUserAction`; [`app/api/webhooks/clerk/route.ts`](../../app/api/webhooks/clerk/route.ts); compare `cancelTrainerBilling` in `actions/account-actions.ts` | Reuse `cancelTrainerBilling` before `deleteUserData` in both paths |
| S2 | **Account deletion leaves uploaded files in R2** (meal photos, voice notes, program briefs). This contradicts the delete dialog ("Everything you have logged … will be removed") and the policy | `lib/services/user-deletion.service.ts` (no R2 deletes); uploads in `actions/nutrition-actions.ts`, `actions/voice-memo-actions.ts`, `actions/voice-message-actions.ts` | Delete the objects, or reword the copy and policy. *(found in Plan 5)* |
| S3 | **Dashboard timezone bug.** In UTC+N zones, between local midnight and 0N:00, a session scheduled "today" is bucketed to the previous day by the UTC-anchored calendar helpers, so the client's "TODAY" card doesn't render. `components/dashboard/__tests__/client-dashboard-render.test.tsx` fails in those windows | Web-foundation plan, "Full verification"; `lib/utils/calendar-date.ts` | Real for clients east of UTC; needs its own ticket. It can also affect a reviewer outside the US |
| S4 | **Trainer sign-up is open in the app.** A trainer who signs up on a phone gets a 14-day trial, then a screen saying the subscription is managed on the web. A reviewer may read that as an unlockable paid service without IAP (3.1.1 / 3.1.3) | `app/sign-up/[[...sign-up]]/page.tsx`; `actions/onboarding-actions.ts`; `components/billing/subscription-attention-screen.tsx` | Owner decision: keep it, or limit native sign-up to invited clients. *(found in Plan 5)* |
| S5 | **Purchase wording inside the app.** `/terms` renders on native with "Trainer subscriptions and any program purchases are sold and managed through our website. Prices, trial periods … are shown at checkout." `/p/<slug>` says "This program is available on our website." Both point at purchasing outside the app | `lib/legal/terms-of-service.ts`; `components/billing/native-purchase-notice.tsx` | Owner decision on wording. A neutral line such as "Not available in the app" is safer for 3.1.1. *(found in Plan 5)* |
| S6 | **Check-ins, habits and assessments have no navigation entry** on any screen size. Check-ins can only be reached from notification links | Trainer pass ruling 4; `components/layout/nav-items.ts` | Owner decision. It affects what reviewers can find (see the seed-data note in review-notes.md) |
| S7 | **Clients can't upload progress photos.** `addProgressPhotoAction` has no caller, and the trainer's Photos tab says "Photos will appear here once the client uploads them." Spec QA item 9 assumed this worked | `actions/progress-actions.ts`; `components/progress/photos-tab.tsx` | Build the upload, or hide the empty tab. *(found in Plan 5)* |
| S8 | **MongoDB backfill for `pushEnabled`.** Prisma doesn't backfill on MongoDB, and the field is required. Older `NotificationPreference` documents without it may fail to read | `prisma/schema.prisma` | OWNER TO CONFIRM after `db push`; backfill `pushEnabled: true` if needed. *(found in Plan 5)* |
| S9 | **Connected-accounts hiding is unverified.** The `profileSection__connectedAccounts` key could not be checked locally | Store-rules ruling 3; `lib/native/auth-appearance.ts` | QA rows 23–25. If it fails, "Connect Google" starts OAuth in the web view |
| S10 | **Vercel Node version.** `firebase-admin` 14 needs Node 22 or newer. The repo has no `engines` field | Push ruling R6 | OWNER TO CONFIRM the Vercel project setting |
| S11 | **APNs sandbox misconfiguration is destructive.** `APNS_SANDBOX=1` on Production makes Apple answer `BadDeviceToken` for every iOS token, and the server prunes them all | `lib/services/push.service.ts`; README §13 | Operational; the warning is logged. Keep it unset on Production |

## Later (accepted for v1)

| # | Issue | Source |
|---|---|---|
| L1 | No app-icon badge count (it needs a badge plugin to clear it) | Push deviation 3 |
| L2 | The Settings push switch needs two taps when `pushEnabled` is already on but the OS permission is undecided. Consider an "Allow on this device" affordance | Push execution rulings ("Open") |
| L3 | Switching push off only gates it server-side; the device token stays registered | Push execution rulings |
| L4 | A narrow re-sign-in race: a slow sign-out unregister can delete the next user's device row (it self-heals on the next launch) | Push execution rulings |
| L5 | The header's phone search button and notifications sheet also show for clients. OWNER TO CONFIRM this is wanted | Trainer pass follow-ups |
| L6 | The phone program-schedule agenda opens the session but has no duplicate or delete | Trainer pass follow-ups |
| L7 | The workout-editor drag grip is 36 px on touch (not 44); its expand and history icons render at 12 px | Trainer pass follow-ups |
| L8 | Hidden desktop tools still mount on phones (the builder's keydown listener, the equipment fetch in the generator). Harmless | Trainer pass follow-ups |
| L9 | Tabs can still overflow at 640–1023 px | Trainer pass execution record |
| L10 | Spec Tier 2 "edit sets/reps via a bottom sheet" on program detail was not built. Program detail is read-only on phones | Trainer pass self-review |
| L11 | Portalled sheets are not covered by the inert wrapper behind blocking screens (cosmetic) | Store-rules ruling 6 |
| L12 | Stripe `resource_missing` on cancel is treated as already cancelled. With a mismatched key or mode, a live subscription could keep billing (a warning is logged) | `actions/account-actions.ts` `isAlreadyCancelled` |
| L13 | If the Clerk delete fails after the database delete, an orphan Clerk user remains. Signing in again starts onboarding (it is logged) | `actions/account-actions.ts` |
| L14 | Trainer–client messaging has no report or block. It is closed 1:1 messaging rather than public user-generated content, which Apple 1.2 targets. OWNER TO CONFIRM if review asks | `Message` model *(found in Plan 5)* |
| L15 | The roadmap's Plan 0 list is out of date: the Firebase iOS app, `GoogleService-Info.plist` and uploading the APNs key to Firebase are no longer needed; the APNs env vars are missing from its Vercel list | Push deviation 1; [release-checklist.md](release-checklist.md) §1 |
| L16 | The spec's status-bar-follows-theme item doesn't apply: the web app is light-only and the status bar is fixed to `LIGHT` | `lib/native/lifecycle.ts` |
| L17 | No CI or Fastlane; builds are manual from Xcode and Android Studio | Spec §11 |
