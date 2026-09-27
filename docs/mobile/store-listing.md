# Inmotus RX mobile — store listing and store answers

This file holds the draft listing copy for the App Store and Google Play, plus the answers to Apple's **App Privacy** questionnaire and Google's **Data safety** form. The answers are derived from the code as of branch `mobile-app-capacitor`, and each one cites the file it rests on. Items the code can't settle are marked **OWNER TO CONFIRM**.

These answers are submitted to Apple and Google. If the code changes (new SDK, new data type, new processor), update this file before the next submission.

---

## 1. Listing copy (draft)

Rules the copy follows:

- It describes only features reachable in the app today.
- It makes no medical, treatment or rehabilitation claims. The terms already say the app "is not medical advice" (`lib/legal/terms-of-service.ts`).
- It says nothing about prices, trials, subscriptions or where to buy anything (Apple 3.1.1).

| Field | Limit | Draft | Chars |
|---|---|---|---|
| App name (both stores) | 30 | Inmotus RX | 10 |
| Subtitle (Apple) | 30 | Exercise programs & coaching | 28 |
| Short description (Play) | 80 | Workouts, messages and meal logs with your personal trainer, in one app. | 72 |
| Promotional text (Apple) | 170 | Your workouts and your coach in one app. See today’s session, log every set, share meals and voice notes, and get reminders for workouts and messages. | 150 |
| Keywords (Apple) | 100 | `trainer,coach,coaching,workout,exercise,program,training,client,nutrition,meal,voice,schedule,sets` | 98 |
| Primary category | — | Health & Fitness (both stores) | — |
| Secondary category (Apple) | — | OWNER TO CONFIRM (for example Lifestyle, or none) | — |

### Description (both stores)

> Inmotus RX connects personal trainers and the people they coach. Your trainer builds your exercise program; you follow it, log it and stay in touch, all from your phone.
>
> **For clients**
> - See today’s workout and your week at a glance, with a calendar of upcoming sessions.
> - Follow each exercise with video demonstrations and your trainer’s notes.
> - Log sets, reps, weight and effort as you go, and tell your trainer how the session felt.
> - Log meals and water. Snap a photo of a meal to get a draft of the foods and macros, then edit it before saving.
> - Message your trainer with text or voice notes.
> - Answer the check-ins your trainer sends.
> - Get reminders for workouts and new messages.
>
> **For trainers**
> - Your client list with status at a glance, and each client’s workouts, adherence and notes.
> - Assign a program to a client and choose the start date.
> - Review completed workouts set by set, along with the client’s feedback.
> - Read check-in answers and nutrition logs, and leave comments.
> - Reply from your inbox with text or voice notes.
> - Browse the exercise library with videos, and see your analytics.
> - The full program builder is designed for a larger screen and stays on the web.
>
> Inmotus RX is a coaching and training tool. It does not provide medical advice, diagnosis or treatment. Talk to a qualified healthcare professional before starting a new exercise program.

The features in this description were checked against these files:

| Feature | Where |
|---|---|
| Client calendar | `CLIENT_NAV` in [`components/layout/nav-items.ts`](../../components/layout/nav-items.ts) |
| Set logging with RPE | [`components/workout/workout-session-tracker.tsx`](../../components/workout/workout-session-tracker.tsx) |
| Meal photo AI draft | `analyzeMealPhoto` in [`lib/services/nutrition-ai.service.ts`](../../lib/services/nutrition-ai.service.ts); the "AI Photo" mode in [`components/nutrition/meal-log-dialog.tsx`](../../components/nutrition/meal-log-dialog.tsx) |
| Voice notes | [`components/voice-memo/VoiceMemoRecorder.tsx`](../../components/voice-memo/VoiceMemoRecorder.tsx) |
| Check-ins | [`app/(platform)/check-ins`](../../app/(platform)/check-ins) |
| Program builder is Tier 3 / desktop-only | [`docs/superpowers/plans/2026-09-27-mobile-trainer-phone-pass.md`](../superpowers/plans/2026-09-27-mobile-trainer-phone-pass.md) |

Two caveats:

- Check-ins have **no navigation entry**. People reach them from notification links (`actions/checkin-actions.ts`), which is why the copy says "answer the check-ins your trainer sends". Seed one for review ([review-notes.md](review-notes.md) §6).
- Progress-photo upload is **not** listed, because clients have no upload control (see [known-issues.md](known-issues.md)).

### URLs

| Field | Value | Status |
|---|---|---|
| Privacy policy URL | `https://app.goinmotus.com/privacy` | Page exists ([`app/privacy/page.tsx`](../../app/privacy/page.tsx)). Its wording needs owner sign-off |
| Terms / EULA | `https://app.goinmotus.com/terms` (or Apple's standard EULA) | Page exists ([`app/terms/page.tsx`](../../app/terms/page.tsx)) |
| Support URL (required by Apple) | OWNER TO CONFIRM | **No support page exists.** Apple needs a URL with contact details, not a `mailto:`. The only contact in the code is `support@goinmotus.com` ([`lib/legal/company.ts`](../../lib/legal/company.ts)) |
| Marketing URL (optional) | `https://app.goinmotus.com/`, OWNER TO CONFIRM | The landing page shows prices and "HIPAA Compliant · SOC 2 Type II" / "HIPAA-ready" claims. Reviewers may open it; see [known-issues.md](known-issues.md). Leaving this optional field empty is fine |
| Play: account-deletion URL (required) | OWNER TO CONFIRM, for example `https://app.goinmotus.com/privacy` | The web resource must tell users how to delete their account. The policy's "Retention and deletion" section says to use Settings; deletion itself is at `https://app.goinmotus.com/settings`, after sign-in |

---

## 2. Screenshots

The app is **iPhone only** (`TARGETED_DEVICE_FAMILY = 1` in `mobile/ios/App/App.xcodeproj/project.pbxproj`), so there are no iPad screenshots. Android is phones only.

| Store | Size (portrait, px) | Count | Notes |
|---|---|---|---|
| App Store: 6.9" iPhone | 1320 × 2868 (1290 × 2796 also accepted) | 3–10 | Required size |
| App Store: 6.5" iPhone | 1284 × 2778 (1242 × 2688 also accepted) | 3–10 | Only needed if you don't supply 6.9". App Store Connect can scale down from 6.9". OWNER TO CONFIRM in the current App Store Connect upload page |
| Google Play: phone | 1080 × 1920 (9:16) | 2–8 (4+ recommended) | PNG or JPEG. Each side 320–3840 px; the long side at most 2× the short side |
| Google Play: feature graphic | 1024 × 500 | 1 | Required |
| Google Play: app icon | 512 × 512, 32-bit PNG | 1 | Use the final icon, not the placeholder "RX" |

Shoot from a TestFlight or internal build signed in to the **demo accounts** with seeded data ([review-notes.md](review-notes.md) §6). Don't show real client names or health data.

Keep out of every shot:

- prices, "trial", "upgrade" and the Billing screen
- `DesktopOnlyNotice` screens
- the attention screen

### Shot list

| # | Role | Screen | What it should show |
|---|---|---|---|
| C1 | Client | Dashboard | Today’s workout card, the week at a glance, the tab bar |
| C2 | Client | Workout in progress | An exercise with a video thumbnail and a few sets logged |
| C3 | Client | Calendar | A week with scheduled and completed sessions |
| C4 | Client | Nutrition | A day's meals with macros; the meal photo draft if possible |
| C5 | Client | Inbox thread | Text messages plus a voice note bubble |
| C6 | Client | Push (lock screen) | Optional: a "New message" notification |
| T1 | Trainer | Clients | The phone card list with status badges |
| T2 | Trainer | Client detail | Overview with this week's workouts and recent activity |
| T3 | Trainer | Completed workout review | Set-by-set cards with the client's feedback |
| T4 | Trainer | Inbox | A thread with a voice note |
| T5 | Trainer | Program detail | Week/day structure (read-only outline) |
| T6 | Trainer | Exercise library | Cards with video thumbnails |

Suggested order, clients first because they are most users: C1, C2, C5, C4, T1, T3, T4, C3, T2, T5.

---

## 3. Third-party SDKs and processors (evidence for §4–§5)

### Analytics, tracking and diagnostics SDKs: none found

I searched the root `package.json`, `mobile/package.json` and all of `app/`, `lib/`, `components/`, `hooks/`, `actions/`, `public/`, `proxy.ts` and `next.config.ts` for: posthog, sentry, `@vercel/analytics`, speed-insights, mixpanel, segment, hotjar, logrocket, gtag / googletagmanager / google-analytics, clarity, fullstory, amplitude, datadog, intercom, crisp, plausible, umami and the Facebook pixel.

There were **no matches**. The only two text hits were the word "amplitude" in exercise descriptions in `lib/db/seed/import-athletic-program.ts`. [`app/layout.tsx`](../../app/layout.tsx) loads no third-party scripts, and the app has no ad SDKs.

### Processors that receive user data

| Processor | What it receives | Evidence |
|---|---|---|
| Clerk (auth) | Name, email, password or email code, profile photo, sessions | `@clerk/nextjs` in `package.json`; [`app/layout.tsx`](../../app/layout.tsx); `actions/account-actions.ts` |
| MongoDB database host | Everything stored by the app | `DATABASE_URL` in [`prisma/schema.prisma`](../../prisma/schema.prisma). The host provider is OWNER TO CONFIRM (for example MongoDB Atlas) |
| Vercel (hosting) | All requests, including IP addresses in request logs | App hosting (`vercel.json`) |
| Cloudflare R2 (file storage) | Meal photos, voice notes, trainer program-brief uploads | [`lib/r2.ts`](../../lib/r2.ts); `actions/nutrition-actions.ts`; `actions/voice-memo-actions.ts`; `actions/voice-message-actions.ts`; `actions/program-actions.ts` |
| Pusher (realtime) | Message content and sender name in transit | [`lib/pusher.ts`](../../lib/pusher.ts); the `new-message` payload in `actions/message-actions.ts` |
| Resend (email) | Email address, name, notification content | [`lib/email/resend.ts`](../../lib/email/resend.ts); `lib/email/send.ts` |
| OpenAI | Meal photos (vision); client names, program data, adherence and feedback (trainer dashboard insights); client profile fields such as diagnosis, limitations and pain score (program generation, a desktop tool) | `lib/services/nutrition-ai.service.ts`; `lib/services/dashboard-ai-insights.service.ts`; [`lib/services/ai.service.ts`](../../lib/services/ai.service.ts); `actions/ai-program-actions.ts` |
| Stripe | Trainer name and email (a customer record is created at trainer onboarding); card details are entered on Stripe's web checkout only, never in the app | `stripe.customers.create` in `actions/onboarding-actions.ts`; [`lib/stripe.ts`](../../lib/stripe.ts); the native checkout routes return 403 (`app/api/stripe/checkout/route.ts`, `app/api/checkout/program/route.ts`) |
| Google Firebase Cloud Messaging | Android push token, plus notification title/body/link | `lib/services/push.service.ts` (`buildFcmMessage`) |
| Apple Push Notification service | iOS push token, plus notification title/body/link | `lib/services/push.service.ts` (`buildApnsPayload`) |
| YouTube | Exercise videos play in a `youtube-nocookie.com` embed; the server uses the YouTube API key only for trainer video search | [`lib/utils/video.ts`](../../lib/utils/video.ts); `components/exercises/universal-video-player.tsx`; `app/api/youtube/*` |

Push content is kept short. A new-message push says "New message" / "{First Last} sent you a message." and does not include the message text (`actions/message-actions.ts`).

`@ai-sdk/anthropic` is listed in `package.json` but not imported anywhere in `app/`, `lib/`, `actions/` or `components/`. Anthropic receives no data.

---

## 4. Apple App Privacy questionnaire

### Top-level answers

- **Do you or your third-party partners collect data from this app?** Yes.
- **Tracking:** **No** data is used to track. There are no ad or analytics SDKs, no data brokers and no cross-app linking (§3). No App Tracking Transparency prompt is needed.
- **Linked to the user:** every collected type below is **linked**. All data sits on a signed-in account (`User` in `prisma/schema.prisma`).
- **Purpose:** **App Functionality** for every type. None is used for Third-Party Advertising, Developer's Advertising or Marketing, Analytics, or Product Personalization, because the code has no analytics or ad pipeline.

### Data types

| Apple data type | Collect? | Linked | Tracking | What / why | Evidence |
|---|---|---|---|---|---|
| Contact Info → Name | Yes | Yes | No | Account name | `User.firstName/lastName` |
| Contact Info → Email Address | Yes | Yes | No | Sign-in, notification email | `User.email`; Clerk |
| Contact Info → Phone Number | Yes (optional) | Yes | No | Optional field at onboarding | `User.phone`; `components/onboarding/onboarding-form.tsx` |
| Contact Info → Physical Address | No | — | — | — | — |
| Health & Fitness → Health | Yes | Yes | No | Diagnosis, comorbidities, limitations, injuries, surgery history, pain score, trainer's clinical notes | `ClientProfile` (mapped to `patientProfile`), `ClinicalNote` in `prisma/schema.prisma` |
| Health & Fitness → Fitness | Yes | Yes | No | Workout logs (sets, reps, weight, RPE), session feedback, body metrics, nutrition and water logs, habits, check-in answers | `SetLog`, `SessionFeedback`, `BodyMetric`, `NutritionLog`, `CheckInResponse` models |
| Financial Info | No | — | — | No payment data is entered in the app. Card details go to Stripe on the web only | §3 Stripe row |
| Location | No | — | — | No location permission or API use | `mobile/ios/App/App/Info.plist`, `mobile/android/app/src/main/AndroidManifest.xml` |
| Sensitive Info | No | — | — | Health data is declared under Health. OWNER TO CONFIRM that no screen asks for the categories Apple lists here (racial or ethnic data, sexual orientation, pregnancy, disability, religion, political opinion, genetic or biometric data) | `ClientProfile` fields |
| Contacts | No | — | — | The address book is never read. (Trainers can type or CSV-import client names and emails; those are declared as Contact Info) | `components/shared/bulk-invite-tab.tsx` |
| User Content → Emails or Text Messages | Yes | Yes | No | In-app trainer–client messages | `Message` model; `actions/message-actions.ts` |
| User Content → Photos or Videos | Yes | Yes | No | Meal photos (camera or library); profile photo via Clerk. No user video uploads | `NSCameraUsageDescription` / `NSPhotoLibraryUsageDescription`; `actions/nutrition-actions.ts` |
| User Content → Audio Data | Yes | Yes | No | Voice notes | `NSMicrophoneUsageDescription`; `actions/voice-memo-actions.ts` |
| User Content → Customer Support | No | — | — | No in-app support channel | — |
| User Content → Other User Content | Yes | Yes | No | Check-in answers, trainer notes and program content; trainer program-brief file uploads | `CheckInResponse`; `actions/program-actions.ts` |
| Browsing History | No | — | — | — | — |
| Search History | No | — | — | In-app search is not stored. OWNER TO CONFIRM | `components/search/*` |
| Identifiers → User ID | Yes | Yes | No | Account IDs (database and Clerk IDs) | `User.id`, `User.clerkId` |
| Identifiers → Device ID | Yes (recommended conservative answer) | Yes | No | The APNs or FCM push token, stored with the app version to deliver notifications. Not an advertising identifier. OWNER TO CONFIRM that you want to declare it | `PushDevice` model |
| Purchases → Purchase History | No | — | — | No purchases in the app. Web subscription status is stored, but the app doesn't collect it. OWNER TO CONFIRM | `TrainerSubscription` model |
| Usage Data → Product Interaction | OWNER TO CONFIRM (recommend Yes) | Yes | No | Audit log of account actions (actor, action, target) for organization admins | [`lib/services/audit-log.service.ts`](../../lib/services/audit-log.service.ts); `AuditLog` model |
| Usage Data → Advertising Data | No | — | — | — | — |
| Diagnostics → Crash / Performance / Other | No SDK. OWNER TO CONFIRM | — | — | No crash or performance SDK (§3). Server logs on Vercel hold request data; decide whether their retention counts as collection | `console.error` logging throughout |
| Other Data Types | Yes | Yes | No | Date of birth and occupation (client profile) | `User.dateOfBirth`; `ClientProfile.occupation`; `components/onboarding/client-onboarding-form.tsx` |

### AI disclosure

Apple guideline 5.1.2(i) requires apps to disclose, and get permission for, sharing personal data with third-party AI. OpenAI receives meal photos and client data (§3). The privacy policy mentions "AI model providers" generally but names no provider, and the app asks no in-app consent. See [known-issues.md](known-issues.md). OWNER TO CONFIRM the approach before submission.

---

## 5. Google Play Data safety form

### Overview answers

| Question | Answer | Evidence |
|---|---|---|
| Does the app collect or share any required user data types? | Yes (collects) | §3 |
| Is all user data encrypted in transit? | Yes. HTTPS only; release builds refuse cleartext | `mobile/scripts/verify.cjs` (`--release`); `server.url` is `https://app.goinmotus.com` |
| Do you provide a way for users to request that their data be deleted? | Yes. In app: Settings → Delete account; on the web at the same path | [`components/settings/delete-account-section.tsx`](../../components/settings/delete-account-section.tsx); `actions/account-actions.ts` |
| Data shared with third parties? | **No** for every type. Every recipient in §3 is a service provider processing on our behalf, which Google does not count as "sharing". OWNER TO CONFIRM that each processor, especially OpenAI, is under processor/API terms | §3 |
| Committed to the Families policy? | No. The app is not for children; the privacy policy says it is not directed at under-16s | `lib/legal/privacy-policy.ts` |
| Independent security review | No (optional) | — |

### Data types (all: Collected = Yes, Shared = No, Processed ephemerally = No)

| Google category → type | Required or optional | Purposes | Evidence |
|---|---|---|---|
| Personal info → Name | Required | App functionality, Account management | `User` |
| Personal info → Email address | Required | App functionality, Account management, Developer communications (notification email) | `User.email`; `lib/email/*` |
| Personal info → Phone number | Optional | App functionality | `User.phone` |
| Personal info → User IDs | Required | App functionality, Account management | `User.id`, `clerkId` |
| Personal info → Other info (date of birth, occupation) | Optional | App functionality | `User.dateOfBirth`, `ClientProfile.occupation` |
| Health and fitness → Health info | Optional (clients; entered by client or trainer) | App functionality | `ClientProfile`, `ClinicalNote` |
| Health and fitness → Fitness info | Required for core use | App functionality | Workout, nutrition and check-in models |
| Messages → Other in-app messages | Optional | App functionality | `Message` |
| Photos and videos → Photos | Optional | App functionality | Meal photos; profile photo |
| Audio → Voice or sound recordings | Optional | App functionality | Voice notes |
| Files and docs | Optional (trainers) | App functionality | Program-brief uploads (`actions/program-actions.ts`) |
| App activity → App interactions | OWNER TO CONFIRM (recommend Yes) | App functionality, Fraud prevention / security | `AuditLog` |
| App activity → Other user-generated content | Optional | App functionality | Check-in answers, notes |
| Device or other IDs | Required on devices with push on | App functionality (notifications) | `PushDevice.token` |
| Financial info | Not collected | — | No payment in app |
| Location | Not collected | — | No permission (`AndroidManifest.xml`) |
| App info and performance (crash logs, diagnostics) | Not collected by an SDK. OWNER TO CONFIRM for server logs | — | §3 |

### Other Play Console declarations

| Declaration | Answer | Evidence |
|---|---|---|
| Ads | No ads | §3 |
| App access | Restricted: needs sign-in. Give the demo credentials | [review-notes.md](review-notes.md) |
| Health apps declaration | Required for Health & Fitness apps. Features: fitness and exercise coaching, nutrition logging. Not a medical device, does not diagnose or treat. **Health Connect is not used.** OWNER TO CONFIRM the exact form options | `mobile/android/app/src/main/AndroidManifest.xml` (no Health Connect permissions) |
| Permissions | `INTERNET`, `RECORD_AUDIO` (voice notes), `MODIFY_AUDIO_SETTINGS`, `POST_NOTIFICATIONS`. No broad photo or media permission | `AndroidManifest.xml` |
| Target audience | 18+ recommended (or 16+ to match the policy; OWNER TO CONFIRM). Not designed for children | `lib/legal/privacy-policy.ts`, `lib/legal/terms-of-service.ts` ("at least 16") |
| News app / government / financial features | No | — |

---

## 6. Age rating

### Apple

These are suggested answers to the age-rating questionnaire. Apple revised the questionnaire in 2025; OWNER TO CONFIRM the wording in App Store Connect.

| Question | Answer | Why |
|---|---|---|
| Violence (cartoon or realistic), sexual content, nudity, profanity, horror, mature themes | None | No such content in the product |
| Alcohol, tobacco, drugs | None | — |
| Gambling / simulated gambling / contests | None | — |
| Medical or treatment information | **Infrequent / Mild**, OWNER TO CONFIRM | Exercise programs and injury/limitation fields are health-related, even though the app is not medical advice |
| Health or wellness topics | Yes | Health & Fitness app |
| Unrestricted web access | No | Off-site links open in an in-app browser, but the app has no general browser ([`lib/native/lifecycle.ts`](../../lib/native/lifecycle.ts)) |
| User-generated content / messaging and chat | Yes: 1:1 messaging between a trainer and their own clients | `Message` model |
| Parental controls / age assurance | None | — |

The likely result is 13+ or 16+ depending on the answers. The legal pages say users must be at least 16 (terms) and that the app is not for under-16s (privacy policy). Pick **16+** or higher if offered. OWNER TO CONFIRM.

### Google (IARC questionnaire)

- Category: Reference, News or Educational? No. Use "All other app types".
- Violence, sexuality, language, controlled substances and gambling: none.
- Users can interact or exchange content: **Yes** (trainer–client messages).
- Shares the user's location with others: No.
- Allows purchases of digital goods: **No** in the app.

---

## 7. Export compliance

- `ITSAppUsesNonExemptEncryption` is **`<false/>`** in [`mobile/ios/App/App/Info.plist`](../../mobile/ios/App/App/Info.plist) (verified). `npm run verify` fails if it isn't ([`mobile/scripts/verify.cjs`](../../mobile/scripts/verify.cjs)).
- Justification: the app uses only standard HTTPS/TLS provided by the OS. There is no custom or proprietary encryption.
- App Store Connect should therefore not ask the export-compliance question for each build. If it does, answer "None of the algorithms mentioned above" / exempt.
