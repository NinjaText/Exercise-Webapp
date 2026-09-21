# Inmotus RX Mobile App — Roadmap

**Spec:** `docs/superpowers/specs/2026-09-20-mobile-app-capacitor-design.md`
**Branch:** `mobile-app-capacitor`

The spec is implemented as six plans. Each one ships working, testable
software on its own and is written when its predecessor is done, because
later plans depend on the real shape of earlier code and on the trainer
screen audit. Plan 1 is written now.

| # | Plan | Spec sections | Depends on | Deliverable |
|---|---|---|---|---|
| 0 | Accounts & infrastructure (checklist below, no code) | §8 Firebase setup, §10, §11 | none | Store accounts, Firebase project, APNs key, Clerk session settings |
| 1 | Web foundation — `2026-09-21-mobile-web-foundation.md` | §4, §5 (nav, safe areas, CSS), §6 (account deletion, legal pages) | none | Native detection, provider, tab bar, legal pages, in-app account deletion |
| 1b | Trainer mobile pass | §5a | 1 | 390 px audit checklist, Tier 1 redesigns, Tier 2 adjustments, Tier 3 desktop-only notices |
| 2 | Native shell | §3, §5 (lifecycle, media permissions), §9 offline, §11 | 1 | `mobile/` folder, iOS + Android projects, splash, icons, offline page, dev live-reload, version script |
| 3 | Push notifications | §8 | 1, 2, 0 (Firebase) | `PushDevice`, push service, registration UI, triggers, badge |
| 4 | Store rules & links | §5 (links, downloads, haptics), §6 (sign-in appearance), §7, §9 deep links + version gate | 1, 2 | Billing gate, purchase page, email-only sign-in, download bridge, universal links, update screen |
| 5 | QA & release | §10, §12 | all | Device QA matrix executed, listings, TestFlight and Play internal, submission |

Plans 0, 1 and 2 can run in parallel. 1b can run in parallel with 2 and 3.

## Plan 0 — Accounts & infrastructure checklist

Owner: you (business owner). Start immediately; verification steps take days.

### Apple

- [ ] Obtain a D-U-N-S number for the company if none exists (free, 5–10 business days): https://developer.apple.com/enroll/duns-lookup/
- [ ] Enroll in the Apple Developer Program as an **Organization** (99 USD/yr). Requires legal entity name matching the D-U-N-S record, a website, and a person with legal authority to sign.
- [ ] In App Store Connect, create the app record: name **Inmotus RX**, bundle ID `com.goinmotus.app`, primary language English, SKU `inmotus-rx-ios`.
- [ ] Create an **APNs Auth Key** (Certificates, Identifiers & Profiles → Keys → Apple Push Notifications service). Download the `.p8` once and store it in the team password manager with the Key ID and Team ID.
- [ ] Register the bundle ID with capabilities: Push Notifications, Associated Domains.
- [ ] Note the **Team ID**; Plan 4 needs it for `apple-app-site-association`.

### Google

- [ ] Create a Google Play Console developer account as an **Organization** (25 USD one-time). Requires a D-U-N-S number since 2024 and a verified organization email and phone.
- [ ] Create the app: name **Inmotus RX**, default language English, app (not game), free.
- [ ] Complete Play App Signing enrollment when prompted during first upload (Google manages the release key; you keep the upload keystore).
- [ ] Store the upload keystore and its passwords in the team password manager.

### Firebase

- [ ] Create Firebase project `inmotus-rx` (Blaze plan is not required for FCM).
- [ ] Add an Android app with package `com.goinmotus.app`; download `google-services.json`.
- [ ] Add an iOS app with bundle ID `com.goinmotus.app`; download `GoogleService-Info.plist`.
- [ ] Project settings → Cloud Messaging → Apple app configuration → upload the APNs `.p8` with Key ID and Team ID.
- [ ] Project settings → Service accounts → Generate new private key. Base64-encode the JSON and store it as `FIREBASE_SERVICE_ACCOUNT_JSON` in Vercel (Production and Preview).

### Clerk

- [ ] Dashboard → Sessions: set inactivity timeout to 30 days and maximum lifetime to 90 days (or your policy) so app users are not signed out weekly.
- [ ] Note the production Frontend API domain and Accounts domain (e.g. `clerk.goinmotus.com`, `accounts.goinmotus.com`). Plan 2 needs them for `allowNavigation`.
- [ ] Confirm which sign-in strategies are enabled. Email + password or email code must be on; Plan 4 hides social buttons on native.

### Vercel

- [ ] Add env vars (Production + Preview): `FIREBASE_SERVICE_ACCOUNT_JSON`, `MOBILE_MIN_VERSION_IOS=1.0.0`, `MOBILE_MIN_VERSION_ANDROID=1.0.0`, `NEXT_PUBLIC_IOS_STORE_URL` and `NEXT_PUBLIC_ANDROID_STORE_URL` (fill after first store listing exists; empty until then).

### Review assets (needed by Plan 5, prepare early)

- [ ] App icon 1024×1024 PNG without alpha; splash artwork 2732×2732 centered logo on solid brand background, light and dark variants.
- [ ] Privacy policy and terms live at `/privacy` and `/terms` (Plan 1 creates the pages; you supply the final legal wording).
- [ ] Support email and support URL for the listings.
- [ ] Demo trainer and demo client accounts with a seeded program, messages, nutrition log and a completed workout. Credentials go in App Store Connect → App Review Information.
