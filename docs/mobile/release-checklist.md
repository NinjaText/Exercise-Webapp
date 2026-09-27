# Inmotus RX mobile — release checklist

From zero to both stores, in order. The app is a Capacitor remote-webview shell in `mobile/` that loads `https://app.goinmotus.com`. It is one app for trainers and clients, with bundle ID / package `com.goinmotus.app`.

This checklist sequences the work and records what the code actually needs. It links to [`mobile/README.md`](../../mobile/README.md), the runbook, for the how-to detail instead of repeating it.

Related docs: [qa-matrix.md](qa-matrix.md) · [store-listing.md](store-listing.md) · [review-notes.md](review-notes.md) · [known-issues.md](known-issues.md).

Anything marked **OWNER TO CONFIRM** could not be checked from the code.

---

## 1. Accounts (Plan 0)

Cross-checked against the Plan 0 checklist in [`docs/superpowers/plans/2026-09-21-mobile-app-roadmap.md`](../superpowers/plans/2026-09-21-mobile-app-roadmap.md). Some of what was built differs from that checklist; the differences are marked **Changed**.

### Apple

| # | Step | Status / note |
|---|---|---|
| A1 | D-U-N-S number for the company | OWNER TO CONFIRM |
| A2 | Apple Developer Program, **Organization** membership | OWNER TO CONFIRM |
| A3 | App Store Connect record: name **Inmotus RX**, bundle ID `com.goinmotus.app`, SKU `inmotus-rx-ios`, English | OWNER TO CONFIRM |
| A4 | Register the App ID `com.goinmotus.app` with the **Push Notifications** and **Associated Domains** capabilities | Needed. [`mobile/ios/App/App/App.entitlements`](../../mobile/ios/App/App/App.entitlements) declares `applinks:app.goinmotus.com` and `aps-environment` |
| A5 | APNs Auth Key (`.p8`): store it with its Key ID and your Team ID | Needed. **Changed:** the server now signs APNs requests itself (see §5). You no longer upload the key to Firebase |
| A6 | Note the Team ID | Used by `APPLE_TEAM_ID` for both push and universal links (§2) |

### Google

| # | Step | Status / note |
|---|---|---|
| G1 | Play Console developer account, **Organization** (needs D-U-N-S) | OWNER TO CONFIRM |
| G2 | Create the app: **Inmotus RX**, English, app, free | OWNER TO CONFIRM |
| G3 | Enroll in Play App Signing on the first upload | Needed. Its SHA-256 goes into `ANDROID_SHA256_CERT_FINGERPRINTS` (§2) |
| G4 | Keep the upload keystore and its passwords in the password manager | Needed. `*.keystore` and `*.jks` are git-ignored ([`mobile/.gitignore`](../../mobile/.gitignore)) |

### Firebase (Android push only)

| # | Step | Status / note |
|---|---|---|
| F1 | Create the Firebase project (the roadmap suggests `inmotus-rx`) | Needed |
| F2 | Add an Android app `com.goinmotus.app` and download `google-services.json` into `mobile/android/app/` | Needed. The file is git-ignored |
| F3 | ~~Add an iOS app and download `GoogleService-Info.plist`~~ | **Changed: not needed.** iOS push goes to APNs directly ([`lib/services/push.service.ts`](../../lib/services/push.service.ts)) |
| F4 | ~~Upload the APNs `.p8` to Firebase Cloud Messaging~~ | **Changed: not needed**, for the same reason |
| F5 | Generate a service-account key, base64-encode the JSON, and store it as `FIREBASE_SERVICE_ACCOUNT_JSON` | Needed (§2) |

### Clerk

See §4.

### Review assets (roadmap "Review assets")

| # | Asset | State in the repo |
|---|---|---|
| R1 | App icon 1024×1024 without alpha, and splash art 2732×2732 in light and dark variants | **Placeholder art only.** `mobile/resources/` holds a plain "RX" mark (README §7). Replace it and run `npm run assets` |
| R2 | `/privacy` and `/terms` live | The pages exist ([`app/privacy/page.tsx`](../../app/privacy/page.tsx), [`app/terms/page.tsx`](../../app/terms/page.tsx)). Their wording and the values in [`lib/legal/company.ts`](../../lib/legal/company.ts) still need owner sign-off. See [known-issues.md](known-issues.md) |
| R3 | Support email and support URL | There is **no support page** in the app. The only contact is `support@goinmotus.com` in `lib/legal/company.ts`. OWNER TO CONFIRM a support URL (see [known-issues.md](known-issues.md)) |
| R4 | Demo trainer and demo client accounts with seeded data | Not created. See [review-notes.md](review-notes.md) §6 |

---

## 2. Server environment variables (Vercel)

These are the variables the mobile, push and deep-link code reads. I found them by grepping `process.env` / `readEnv(...)` across `app/`, `lib/`, `components/`, `actions/`, `proxy.ts` and `mobile/`. I checked the local `.env` and `.env.local` for variable **names only**: none of the variables in the first table below are in either file. The examples are fake.

| Variable | Read in | Purpose | Example (fake) | When missing |
|---|---|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | [`lib/services/push.service.ts`](../../lib/services/push.service.ts) (`sendFcm`) | Signs FCM v1 calls for Android push. Holds the base64 of the service-account JSON file | `ewogICJ0eXBlIjogInNlcnZpY2VfYWNjb3VudCIs...` | Android push is skipped and the server logs `[push] FCM not configured` once |
| `APNS_KEY_P8` | `lib/services/push.service.ts` (`sendApns`) | Holds the base64 of the `.p8` file's contents, which signs the ES256 APNs provider token | `LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0t...` | iOS push is skipped and the server logs `[push] APNs not configured` |
| `APNS_KEY_ID` | `lib/services/push.service.ts` | The Key ID shown next to the APNs key | `AB12CD34EF` | Same as above |
| `APPLE_TEAM_ID` | `lib/services/push.service.ts`; [`app/.well-known/apple-app-site-association/route.ts`](../../app/.well-known/apple-app-site-association/route.ts) | Your 10-character Team ID. Used for APNs and in the universal-links file | `A1B2C3D4E5` | iOS push is skipped, and `/.well-known/apple-app-site-association` returns 404 |
| `APNS_SANDBOX` | `lib/services/push.service.ts` | Set it to `1` **only** on a non-production deployment that serves development-signed builds. When unset, the server sends to the production APNs host | unset (Production) / `1` (Preview only, if needed) | Uses production APNs. That is correct for TestFlight and the App Store |
| `ANDROID_SHA256_CERT_FINGERPRINTS` | [`app/.well-known/assetlinks.json/route.ts`](../../app/.well-known/assetlinks.json/route.ts) | The Play App Signing SHA-256, comma-separated. You can add the upload key's SHA-256 too | `AB:CD:EF:...:90` | `/.well-known/assetlinks.json` returns 404, and https links open in the browser |
| `MOBILE_MIN_VERSION_IOS` | [`app/api/mobile/config/route.ts`](../../app/api/mobile/config/route.ts) | Lowest iOS app version allowed to run (§11) | `1.0.0` | Defaults to `1.0.0` |
| `MOBILE_MIN_VERSION_ANDROID` | `app/api/mobile/config/route.ts` | Lowest Android app version allowed to run | `1.0.0` | Defaults to `1.0.0` |
| `NEXT_PUBLIC_IOS_STORE_URL` | `app/api/mobile/config/route.ts` | The link behind the "Update required" screen's button | `https://apps.apple.com/app/id0000000000` | The screen shows with no button |
| `NEXT_PUBLIC_ANDROID_STORE_URL` | `app/api/mobile/config/route.ts` | Same, for Android | `https://play.google.com/store/apps/details?id=com.goinmotus.app` | Same |
| `NEXT_PUBLIC_NATIVE_DEBUG` | [`components/providers/native-provider.tsx`](../../components/providers/native-provider.tsx) | `1` lets a production build honour the `?native=ios|android` override used for browser testing | **leave unset in Production** | Override only works in dev |

Two related variables are read at **build/sync time on the Mac that builds the app**, not by Vercel:

| Variable | Read in | Purpose | Release value |
|---|---|---|---|
| `CAP_SERVER_URL` | [`mobile/server-url.cjs`](../../mobile/server-url.cjs) | Points the shell at a laptop or a preview deployment | **Unset.** `verify:release` refuses anything other than `https://app.goinmotus.com` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | [`mobile/clerk-host.cjs`](../../mobile/clerk-host.cjs), via `npm run sync` | The Clerk frontend-API host is decoded from this key and added to `allowNavigation` | The **production** (`pk_live_…`) key. Both local `.env` files currently hold a `pk_test_…` (development instance) key, and `verify:release` will refuse the resulting `*.clerk.accounts.dev` host. See §4 |

Checks:

- [ ] Set the push variables in Vercel **Production**: `FIREBASE_SERVICE_ACCOUNT_JSON`, `APNS_KEY_P8`, `APNS_KEY_ID`, `APPLE_TEAM_ID`. Leave `APNS_SANDBOX` **unset**. If you set `APNS_SANDBOX` on Production, every iOS token gets pruned (README §13).
- [ ] Set `ANDROID_SHA256_CERT_FINGERPRINTS` (Production) once Play App Signing exists.
- [ ] Leave `MOBILE_MIN_VERSION_*` unset or at `1.0.0`. Set the `NEXT_PUBLIC_*_STORE_URL` values only after the listings exist (§11).
- [ ] Check the Vercel project's Node.js version. `firebase-admin` 14.5.0 needs Node 22 or newer (push plan ruling R6). The repo's `package.json` has no `engines` field. OWNER TO CONFIRM the Vercel setting (the ruling assumed Vercel's default, Node 24).
- [ ] The existing web variables must still be set in Production. The native flows depend on them: Clerk, `DATABASE_URL`, Pusher, R2, Resend, Stripe, OpenAI, `NEXT_PUBLIC_APP_URL`, `CLERK_WEBHOOK_SECRET` and `CRON_SECRET`.

---

## 3. Database change (owner runs it)

The schema adds:

- the `PushDevice` model, with a unique `token`, an index on `userId` and the `PushPlatform` enum. It is in [`prisma/schema.prisma`](../../prisma/schema.prisma), `model PushDevice`.
- `User.pushDevices`, a relation only.
- `NotificationPreference.pushEnabled Boolean @default(true)`.

- [ ] With `DATABASE_URL` pointing at the **production** database, run from the repo root:
  ```
  npx prisma db push
  ```
  No automation runs this; the owner runs it. On MongoDB it creates the collection and indexes. It does not rewrite existing documents.
- [ ] **OWNER TO CONFIRM:** check whether any existing `NotificationPreference` documents lack `pushEnabled`. Prisma on MongoDB does not backfill, and the field is required. If older rows exist without it, reading them may fail. Backfill the missing field with `true` if so. (The model also came in with the email-notification work, so production may not have any rows yet.)
- [ ] Deploy only after the push is done. Otherwise `registerPushDeviceAction` and account deletion (`prisma.pushDevice.deleteMany` in [`lib/services/user-deletion.service.ts`](../../lib/services/user-deletion.service.ts)) run against a collection that doesn't exist.

---

## 4. Production Clerk

- [ ] A **production** Clerk instance on a `goinmotus.com` domain (for example `clerk.goinmotus.com`). The shell allows `app.goinmotus.com`, `*.goinmotus.com` and exactly one decoded Clerk host ([`mobile/capacitor.config.ts`](../../mobile/capacitor.config.ts)). `npm run verify:release` fails on any `accounts.dev` host ([`mobile/scripts/verify.cjs`](../../mobile/scripts/verify.cjs)).
- [ ] Production Vercel uses the production keys (`pk_live_…`, plus the matching `CLERK_SECRET_KEY`). OWNER TO CONFIRM; I could only see the local files, and they hold `pk_test_…`.
- [ ] The Mac that runs `npm run sync` for a release has the production publishable key in its shell environment, `.env.local` or `.env`.
- [ ] Sessions: inactivity timeout of about 30 days and maximum lifetime of about 90 days (roadmap Plan 0), so app users are not signed out weekly.
- [ ] Email + password and/or email code sign-in is enabled. The native shell hides Clerk's social buttons ([`lib/native/auth-appearance.ts`](../../lib/native/auth-appearance.ts)), so email is the only way in on a phone.
- [ ] Social providers can stay on for the web. Then run the three device checks in README §9 ("Device checklist (sign-in)").
- [ ] The `user.deleted` webhook points at `https://app.goinmotus.com/api/webhooks/clerk`, with `CLERK_WEBHOOK_SECRET` set ([`app/api/webhooks/clerk/route.ts`](../../app/api/webhooks/clerk/route.ts)).

---

## 5. Firebase and APNs setup

Follow README §13 ("Push notifications"). A summary of what the code expects:

| Platform | Delivery path | Needs |
|---|---|---|
| Android | FCM via `firebase-admin`. Priority high, channel `default` (created on device by [`lib/native/push.ts`](../../lib/native/push.ts)), small icon `ic_stat_notify` | `mobile/android/app/google-services.json` present **at sync time**, plus `FIREBASE_SERVICE_ACCOUNT_JSON` on the server |
| iOS | APNs over HTTP/2 with a token JWT. Topic `com.goinmotus.app`, production host by default | Push capability on the App ID, plus `APNS_KEY_P8`, `APNS_KEY_ID` and `APPLE_TEAM_ID` on the server |

- [ ] Android: the ` push` user-agent marker is written by `npm run sync` **only if `google-services.json` exists at that moment** (`capacitor.config.ts`). Add the file, then re-sync, then build. `verify:release` fails when the file is missing.
- [ ] iOS: `aps-environment` is `development` in `App.entitlements` on purpose. Xcode rewrites it to `production` when it exports an archive for the App Store. `aps-environment` and Associated Domains are attached to the **Release** configuration only (README §12–13), so test push and universal links on TestFlight or Release builds.
- [ ] There is no app-icon badge in v1 (push plan deviation 3).

---

## 6. Versioning

README §6 is the full procedure. `mobile/package.json` `"version"` is the single source: currently `1.0.0`, stamped as build `10000`.

- [ ] Bump `"version"` (`x.y.z`, with minor and patch below 100).
- [ ] `cd mobile && npm run version:set`, then commit the stamped `project.pbxproj` and `build.gradle`.
- [ ] The build number comes from the version (`major*10000 + minor*100 + patch`). To re-upload after a rejected or broken build, **bump the patch**; you cannot reuse a version with a new build number.

---

## 7. Pre-build gate (`verify:release`)

Run this on the build machine before **every** store build (README §9):

```
cd mobile
npm run sync            # CAP_SERVER_URL unset; production Clerk key in env
npm run verify:release  # must print "mobile verify OK"
npm test
```

On top of the `npm run verify` checks, `verify:release` fails when:

- `server.url` is anything other than `https://app.goinmotus.com`
- cleartext is on
- `allowNavigation` has an `accounts.dev` host
- the iOS or Android stamped version differs from `package.json`
- `google-services.json` is missing

(Source: [`mobile/scripts/verify.cjs`](../../mobile/scripts/verify.cjs).)

It also confirms that `ITSAppUsesNonExemptEncryption` is `<false/>` and that the usage strings, the deep-link wiring and the push wiring are present.

---

## 8. Build and sign

### iOS: Archive to TestFlight

README §8. In short:

- [ ] `npm run open:ios`. In Signing & Capabilities, choose the **company team**, not a Personal Team.
- [ ] Destination **Any iOS Device (arm64)**, then **Product → Archive**.
- [ ] **Distribute App → App Store Connect → Upload**.
- [ ] In App Store Connect, wait for processing. Answer the export-compliance prompt if asked; `ITSAppUsesNonExemptEncryption` is already `NO` in [`Info.plist`](../../mobile/ios/App/App/Info.plist), so it should not ask.
- [ ] Add the build to **TestFlight** internal testing and run [qa-matrix.md](qa-matrix.md) on it.
- [ ] The app target has no `PrivacyInfo.xcprivacy` privacy manifest, but `@capacitor/filesystem` uses file-timestamp APIs. Add a manifest before the first upload. See [known-issues.md](known-issues.md).

### Android: signed AAB to the internal track

README §8. In short:

- [ ] `google-services.json` is in place and the project re-synced (§5).
- [ ] `npm run open:android`, then **Build → Generate Signed Bundle / APK → Android App Bundle**, using the upload keystore. Back it up outside the repo.
- [ ] Upload the `.aab` to **Testing → Internal testing**. Accept Play App Signing on the first upload.
- [ ] Copy the **app signing key** SHA-256 into `ANDROID_SHA256_CERT_FINGERPRINTS` and redeploy (§9).
- [ ] Run [qa-matrix.md](qa-matrix.md) on a build installed from the internal track.

---

## 9. Redeploy notes

A running Vercel deployment does not pick up saved environment variables; they take effect only after a **redeploy**. `NEXT_PUBLIC_*` values are inlined at build time. (README §13–14.)

Redeploy after changing any of these:

- `FIREBASE_SERVICE_ACCOUNT_JSON`, `APNS_*`, `APPLE_TEAM_ID`
- `ANDROID_SHA256_CERT_FINGERPRINTS`
- `MOBILE_MIN_VERSION_*`, `NEXT_PUBLIC_*_STORE_URL`
- the Clerk keys

After the redeploy, open these in a browser. Both must return JSON, not a 404 or a sign-in page (README §12):

- `https://app.goinmotus.com/.well-known/apple-app-site-association`
- `https://app.goinmotus.com/.well-known/assetlinks.json`

`/api/mobile/config` is public and cached for 5 minutes (`Cache-Control: public, max-age=300`), so a version-gate change can take up to 5 minutes to reach devices after the redeploy.

Web-only changes (anything outside `mobile/`) ship with a normal Vercel deploy. Installed apps pick them up on their next load, with no store review.

---

## 10. Submission and promotion to production

- [ ] Fill in [store-listing.md](store-listing.md) (listing copy, screenshots, App Privacy, Data safety, age rating) and [review-notes.md](review-notes.md) (reviewer notes and demo credentials).
- [ ] Clear every **Blocker** in [known-issues.md](known-issues.md).
- [ ] iOS: attach the TestFlight build to the App Store version, then **Submit for Review**. Pick manual release if you want to line it up with Android.
- [ ] Android: promote the tested release to **Production**, either from the internal track or through closed testing first, then send it for review. The roadmap notes that an Organization account is exempt from the 12-tester / 14-day closed-test rule. OWNER TO CONFIRM that the account shows no testing requirement.
- [ ] After both are live, set `NEXT_PUBLIC_IOS_STORE_URL` and `NEXT_PUBLIC_ANDROID_STORE_URL`, then redeploy.

---

## 11. Forcing an update (version gate)

`/api/mobile/config` ([`app/api/mobile/config/route.ts`](../../app/api/mobile/config/route.ts)) returns `minSupportedVersion` and `storeUrls`. `NativeProvider` checks it on launch and on resume. When the running app version is lower, it shows `UpdateRequiredScreen` ([`components/layout/update-required-screen.tsx`](../../components/layout/update-required-screen.tsx)), which blocks the app and offers a store button.

To force users off an old version:

1. Ship the new version and wait until it is **live in both stores**.
2. Set `MOBILE_MIN_VERSION_IOS` and/or `MOBILE_MIN_VERSION_ANDROID` to that version (for example `1.1.0`).
3. Redeploy. Devices see the change within about 5 minutes (cache).

If you raise the minimum before the new version is installable, those users are locked out. A malformed value never blocks anyone: [`lib/native/version.ts`](../../lib/native/version.ts) treats anything it can't parse as "not blocked". To undo, lower the value and redeploy.
