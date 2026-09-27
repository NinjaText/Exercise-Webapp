# Inmotus RX mobile — App Review / Play review notes

Paste §1–§5 into **App Store Connect → App Review Information → Notes** and into **Play Console → App content → App access** (instructions field). Fill §6 before submitting. Each statement below was checked against the code, and the file is cited so you can re-check it after future changes.

---

## Reviewer notes (paste-ready)

> **What this app is**
> Inmotus RX is a coaching app for personal trainers and their clients. The same app serves both roles, and what you see depends on the account you sign in with. Clients follow the exercise programs their trainer assigns, log workouts and meals, answer check-ins, and message their trainer with text or voice notes. Trainers manage their clients, assign programs, review completed workouts, check-ins and nutrition logs, and reply to messages. Two demo accounts are provided: one trainer and one client of that trainer, with seeded data.
>
> **Native features**
> - Push notifications for new messages, workout reminders and other account events. A foreground notification shows as an in-app banner, and tapping a notification opens the related screen.
> - Universal links (iOS) and App Links (Android) for `app.goinmotus.com` pages such as messages, programs and the dashboard, plus an `inmotus://` URL scheme.
> - Haptic feedback when a set is completed in a workout and when a check-in is submitted.
> - The native share sheet for program PDFs (Download / Print).
> - An offline screen with Retry on launch without a connection, and a "No internet connection" banner during use.
> - Native splash screen and status bar handling, a phone tab bar, safe-area layout, and keyboard handling.
> - External links open in an in-app browser sheet.
> - Camera, photo library and microphone access for meal photos and voice notes, each with its own permission prompt.
>
> **No in-app purchases**
> The app sells nothing and shows no prices. Trainer subscriptions are managed outside the app. Inside the app:
> - there is no billing screen, no price, no purchase button and no link to a payment page;
> - a trainer whose subscription has lapsed sees only a neutral notice ("Your subscription needs attention … managed from your account on the web") and a Sign out button;
> - programs that trainers sell on the web show "This program is available on our website" instead of a price or a Buy button;
> - the server refuses checkout requests from the app.
>
> Client accounts are free and are invited by their trainer.
>
> **Sign-in**
> The app offers email sign-in only (email and password, or an email code). No third-party or social login is offered in the app, so Sign in with Apple (guideline 4.8) does not apply.
>
> **Account deletion**
> Accounts can be deleted inside the app, for either role:
> - Client: tap the menu icon (top left) → **Settings** → scroll to **Delete account** → **Delete my account** → type `DELETE` → **Delete account**.
> - Trainer: tap **More** in the bottom tab bar (or the menu icon, top left) → **Settings** → the same steps.
>
> Deletion removes the profile, health and fitness records, messages and notification devices, and signs the user out. A trainer who is the only active trainer for clients must deactivate or reassign those clients first; the dialog says so and links to the Clients page. For this reason, please test deletion with the separate **deletion test account** below rather than the demo trainer.

---

## 1. Verification of each claim

| Claim | Where in the code |
|---|---|
| One app, two roles | `TRAINER_NAV` / `CLIENT_NAV` in [`components/layout/nav-items.ts`](../../components/layout/nav-items.ts); role routing in [`app/(platform)/layout.tsx`](../../app/(platform)/layout.tsx) |
| Push, foreground toast, tap navigates | [`lib/native/push.ts`](../../lib/native/push.ts); [`components/providers/native-provider.tsx`](../../components/providers/native-provider.tsx); `PushNotifications.presentationOptions: []` in [`mobile/capacitor.config.ts`](../../mobile/capacitor.config.ts); server [`lib/services/push.service.ts`](../../lib/services/push.service.ts). **No badge** |
| Universal links / App Links / `inmotus://` | [`lib/native/deep-link-paths.json`](../../lib/native/deep-link-paths.json); [`mobile/ios/App/App/App.entitlements`](../../mobile/ios/App/App/App.entitlements) (`applinks:app.goinmotus.com`); `CFBundleURLSchemes` `inmotus` in `Info.plist`; the `autoVerify` intent filter in [`AndroidManifest.xml`](../../mobile/android/app/src/main/AndroidManifest.xml); [`app/.well-known/*`](../../app/.well-known) |
| Haptics on set completion and check-in submit | [`lib/native/haptics.ts`](../../lib/native/haptics.ts), used in `components/workout/workout-session-tracker.tsx`, `components/workout/workout-checklist-tracker.tsx` and `app/(platform)/check-ins/[id]/respond/respond-form.tsx` |
| Share sheet for PDFs | [`lib/native/download.ts`](../../lib/native/download.ts) (`@capacitor/filesystem` + `@capacitor/share`); Download PDF and Print in `components/programs/program-detail-view.tsx` and `program-list-client.tsx` |
| Offline screen and banner | [`mobile/www/offline.html`](../../mobile/www/offline.html) (`server.errorPath`); [`components/layout/offline-banner.tsx`](../../components/layout/offline-banner.tsx) |
| Splash / status bar / keyboard | `SplashScreen`, `StatusBar`, `Keyboard` and `SystemBars` in `mobile/capacitor.config.ts`; `splash.hide()` and `statusBar.setStyle` in [`lib/native/lifecycle.ts`](../../lib/native/lifecycle.ts) |
| Tab bar | [`components/layout/mobile-tab-bar.tsx`](../../components/layout/mobile-tab-bar.tsx). It is rendered by the web layer and shown below the `lg` breakpoint |
| In-app browser for external links | `deps.browser.open` in `lib/native/lifecycle.ts` (`@capacitor/browser`) |
| Permission prompts | `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription` and `NSMicrophoneUsageDescription` in [`Info.plist`](../../mobile/ios/App/App/Info.plist); `RECORD_AUDIO` and `POST_NOTIFICATIONS` in `AndroidManifest.xml` |
| No billing entry on native | `NATIVE_HIDDEN_HREFS` in `components/layout/nav-items.ts` |
| Lapsed trainer sees attention screen | Redirect in `app/(platform)/layout.tsx`; the native branch in [`app/billing/page.tsx`](../../app/billing/page.tsx); [`components/billing/subscription-attention-screen.tsx`](../../components/billing/subscription-attention-screen.tsx) (no URL, no price, only Sign out); `app/(platform)/settings/billing/page.tsx` |
| `/billing/success` and `/billing/cancel` unreachable | Both redirect to `/dashboard` on native (`app/billing/success/page.tsx`, `app/billing/cancel/page.tsx`) |
| Program sales page on native | [`app/p/[slug]/page.tsx`](../../app/p/[slug]/page.tsx) renders [`components/billing/native-purchase-notice.tsx`](../../components/billing/native-purchase-notice.tsx); "Sell this program" is hidden on native in `components/programs/program-detail-view.tsx` |
| Server refuses checkout from the app | A 403 on the native user agent in `app/api/checkout/program/route.ts`, `app/api/stripe/checkout/route.ts` and `app/api/stripe/portal/route.ts` |
| Marketing landing (shows prices) never shown in app | [`lib/native/landing.ts`](../../lib/native/landing.ts) via [`proxy.ts`](../../proxy.ts): `/` redirects to `/dashboard` or `/sign-in` on native |
| Legal pages without marketing nav/footer in app | `app/privacy/page.tsx`, `app/terms/page.tsx` → `components/legal/legal-document.tsx` (`{!isNative && <SiteFooter />}`) |
| Email-only sign-in | See §2 |
| Account deletion path | See §3 |

## 2. How sign-in is restricted on native

The restriction is **presentation-level**:

- Clerk itself is unchanged. Any social connections enabled in the Clerk dashboard stay enabled for the web.
- Inside the shell, detected through the user-agent marker `InmotusApp/<version> (ios|android)` ([`lib/native/platform.ts`](../../lib/native/platform.ts)), the sign-in and sign-up pages pass a Clerk `appearance` that hides `socialButtonsBlockButton`, `socialButtonsIconButton` and `dividerRow` ([`lib/native/auth-appearance.ts`](../../lib/native/auth-appearance.ts), [`components/auth/native-aware-auth.tsx`](../../components/auth/native-aware-auth.tsx), `app/sign-in/[[...sign-in]]/page.tsx`, `app/sign-up/[[...sign-up]]/page.tsx`).
- The profile page and the avatar menu's profile hide `profileSection__connectedAccounts` ("Connect Google"): `profileAppearanceFor` in `app/(platform)/settings/page.tsx` and `components/layout/header.tsx`. That element key could not be verified locally. It is one of the device checks (README §9; [qa-matrix.md](qa-matrix.md) rows 23–25).
- The web view's allowed hosts contain no Google or Apple OAuth hosts (`allowNavigation` in `mobile/capacitor.config.ts`).

Run QA rows 5, 6 and 23–25 before you make the "email only" statement.

## 3. Account deletion in detail

- UI: [`components/settings/delete-account-section.tsx`](../../components/settings/delete-account-section.tsx), rendered at the bottom of `/settings` ([`app/(platform)/settings/page.tsx`](../../app/(platform)/settings/page.tsx)).
- Card: "Delete account" → button **Delete my account** → dialog "Delete your account?" → type `DELETE` → **Delete account**.
- How to reach `/settings`:
  - Trainers: the bottom-bar **More** sheet (`getMoreItems` in `nav-items.ts`), or the ☰ menu (`components/layout/header.tsx` → `Sidebar`, "Account" group).
  - Clients: the ☰ menu only, since the client tab bar has five tabs and no More tab.
- Action ([`actions/account-actions.ts`](../../actions/account-actions.ts) `deleteOwnAccountAction`) runs in this order:
  1. Check blockers ([`lib/services/user-deletion.service.ts`](../../lib/services/user-deletion.service.ts) `findDeletionBlockers`). Trainers are also blocked by active clients when they are the organization's only active trainer, by packages with subscribers, and by templates assigned to others.
  2. Cancel the trainer's Stripe subscription.
  3. `deleteUserData`, which also deletes `PushDevice` rows.
  4. Delete the Clerk user.
  5. Sign out and go to `/account-deleted`.
- Uploaded files (meal photos, voice notes) in R2 are **not** deleted by this path. See [known-issues.md](known-issues.md).

## 4. Demo accounts (fill in before submission)

**Nothing has been created.** No accounts were made and the database was not touched. Create these on **production**, where reviewers sign in.

| Account | Email | Password | Notes |
|---|---|---|---|
| Demo trainer | OWNER TO CONFIRM | OWNER TO CONFIRM | Must have a subscription that will not lapse during review (see below) |
| Demo client (of the demo trainer) | OWNER TO CONFIRM | OWNER TO CONFIRM | Invited by the demo trainer, onboarding completed |
| Deletion test account (a client) | OWNER TO CONFIRM | OWNER TO CONFIRM | Separate client with no billing subscription, so the reviewer can delete it without breaking the demo data |

Use email + password (not the email code), so the reviewer does not need inbox access. If Clerk asks for email verification on a new device, OWNER TO CONFIRM that the demo accounts can sign in without a code.

### The demo trainer's subscription

The platform layout redirects any trainer whose trial has expired, or whose status is `CANCELED`, `PAST_DUE` or `UNPAID`, to the attention screen (`app/(platform)/layout.tsx`). New trainers get a **14-day** trial (`actions/onboarding-actions.ts`), which can run out during review. Before submitting, give the demo trainer a `TrainerSubscription` that is `ACTIVE`, or `TRIALING` with a far-future `trialEndsAt`. OWNER TO CONFIRM how: a comped Stripe subscription or a direct database edit, done by you.

### Seed data

| Data | For | How it's reached in the app |
|---|---|---|
| An active program with at least 2 weeks of workouts, with video exercises, assigned with a start date covering the review period | Client | Dashboard, Programs, Calendar |
| At least one completed workout with set logs (reps, weight, RPE) and session feedback | Trainer | Clients → client → session review |
| One workout scheduled for "today" during review | Client | Dashboard "today" card (see the timezone issue in [known-issues.md](known-issues.md)) |
| A message thread in both directions, including one voice note | Both | Inbox |
| Several days of nutrition logs (meals with macros, water), one trainer comment on a log, and nutrition targets | Both | Nutrition; the trainer's client nutrition review |
| A check-in assigned to the client and one answered response | Both | From the notification list (check-ins have no nav entry) |
| A few unread notifications | Both | The bell in the header |
| A second client or two on the trainer | Trainer | Clients list, analytics |

Use only fictional names and data; no real client information.

## 5. Other review answers

- **Sign-up in the app.** New users can create an account with email. Clients are normally invited by their trainer. A trainer who signs up in the app gets a free trial. When it ends, only the neutral attention screen appears (no price or link). See [known-issues.md](known-issues.md) for the review risk this carries.
- **Demo video or extra info.** Not needed. If asked, say that the program builder and bulk tools are desktop-only on purpose; on a phone they show "This tool is built for a larger screen" (`components/shared/desktop-only-notice.tsx`).
- **Medical claims.** None. The terms state the app is not medical advice (`lib/legal/terms-of-service.ts`).
