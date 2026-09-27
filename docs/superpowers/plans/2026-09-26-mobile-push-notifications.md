# Mobile Push Notifications Implementation Plan (Plan 3 of 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver push notifications to the iOS and Android apps for every in-app notification the platform already creates, respecting each user's notification preferences, with correct handling of shared devices, dead tokens and notification taps.

**Architecture:** Devices register a push token through a server action; tokens live in a new `PushDevice` model. `notifyUser` (the single notification entry point, which already writes the in-app notification and sends email) additionally calls `sendPushToUser`, which routes Android tokens to Firebase Cloud Messaging via `firebase-admin` and iOS tokens to Apple Push Notification service over HTTP/2 with a token-based JWT. The client side is a dependency-injected module wired into `NativeProvider`, plus a one-time soft permission prompt and a push toggle on the existing notification settings page.

**Tech Stack:** Next.js 16 App Router, Prisma 6 on MongoDB, `firebase-admin` (new), Node `http2` + `crypto` for APNs, `@capacitor/push-notifications` 8.1.2 (new, both packages), Vitest 4, Node test runner for `mobile/scripts`.

**Spec:** `docs/superpowers/specs/2026-09-20-mobile-app-capacitor-design.md` §8 (push), §10, §11. Roadmap: `docs/superpowers/plans/2026-09-21-mobile-app-roadmap.md`.

## Deviations from the spec (decided before execution)

1. **iOS delivery goes to APNs directly, Android to FCM.** The spec routed both through FCM. Verified in the installed plugin: `@capacitor/push-notifications` returns an **APNs** token on iOS and an **FCM** token on Android (README: "On iOS it contains the APNS token. On Android it contains the FCM token."). Converting iOS tokens to FCM requires the Firebase iOS SDK inside the Xcode project, which cannot be added or verified without Xcode. Direct APNs is free, needs no third-party dashboard (the owner's original reason for choosing FCM), and uses the APNs `.p8` key already on the Plan 0 checklist.
2. **The push on/off switch lives on `NotificationPreference.pushEnabled`**, not `User.pushEnabled`. The email system added after the spec was written keeps all notification preferences in that model; push follows the same per-category toggles (sessions, messages, nutrition) plus its own master switch.
3. **No app-icon badge count in v1.** Setting a badge number requires a way to clear it, which needs an extra badge plugin. A stale badge is worse than none, and unread counts already show in-app. Recorded for a later version.

## Global Constraints

- Tokens: `PushDevice.token` is unique; registering an existing token **reassigns** it to the current user (device handoff between accounts).
- Push never throws into its caller and never blocks or alters email delivery or the action that triggered it.
- Push respects preferences: transactional (billing) types always push; otherwise `pushEnabled` and the type's category toggle must both be on. Email cooldowns do **not** apply to push.
- Missing push configuration disables that platform with a single log line; the web app keeps working. Env vars (all optional): `FIREBASE_SERVICE_ACCOUNT_JSON` (base64 of the service-account JSON), `APNS_KEY_P8` (base64 of the `.p8` file), `APNS_KEY_ID`, `APPLE_TEAM_ID` (already used for universal links), `APNS_SANDBOX` (`"1"` only on a non-production deployment serving development-signed builds; otherwise the production host is used).
- APNs: topic `com.goinmotus.app`, `apns-push-type: alert`, JWT ES256 reused for at most 50 minutes.
- FCM Android: `priority: "high"`, channel `default`, small icon `ic_stat_notify`.
- Tokens are pruned on: FCM `messaging/registration-token-not-registered`, `messaging/invalid-registration-token`, `messaging/invalid-argument`; APNs HTTP 410, or reasons `BadDeviceToken`, `Unregistered`, `DeviceTokenNotForTopic`.
- Notification taps navigate only through the fuzzed deep-link gate (`pathFromAppUrl` in `lib/native/deep-links.ts`); links outside the app origin are ignored.
- `aps-environment` goes in the **Release-only** `App.entitlements` (free Personal Teams cannot sign push; Debug builds on a free Apple ID keep working without push). Push is therefore testable from TestFlight/Release builds.
- `google-services.json`, `GoogleService-Info.plist` and `*.p8` are never committed.
- **Schema changes are applied with `npx prisma generate` only. Never run `npx prisma db push` or any command that touches the database** — the owner applies schema changes to their database.
- Native plugin calls only when `Capacitor.isNativePlatform()` is true. Colours only via semantic tokens. Tests: Vitest 4 node env; mobile `cd mobile && npm test`.
- **Each task ends with one commit** of exactly its files, Conventional Commit subject, `Co-Authored-By:` trailer naming the model that wrote it. Nothing pushed.

## Review Focus

1. **Shared device.** User A signs out and user B signs in on the same phone: A's notifications must stop arriving there. → Task 1 tests token reassignment; Task 5 tests unregister-on-sign-out.
2. **A crafted link in a notification tap** must never navigate off the app origin. → Task 5 tests `linkToPath` against hostile links.
3. **Dead tokens.** Uninstalled apps must be pruned so sends don't fail forever. → Task 2 tests pruning for every listed error on both platforms.
4. **A push outage or misconfiguration** must never break sending a message or the email. → Task 3 tests `notifyUser` with a throwing push sender.
5. **Preferences.** A user who turned push, or a category, off gets no push; billing still pushes. → Task 1 tests `isPushAllowed`; Task 3 tests the wiring.

---

### Task 1: Push device registry, preferences, and cleanup

**Files:**
- Modify: `prisma/schema.prisma` (new `PushPlatform` enum and `PushDevice` model; `User.pushDevices`; `NotificationPreference.pushEnabled`)
- Create: `lib/services/push-device.service.ts`, `lib/services/__tests__/push-device.service.test.ts`, `actions/push-actions.ts`, `actions/__tests__/push-actions.test.ts`, `app/api/push/unregister/route.ts`, `app/api/push/unregister/__tests__/route.test.ts`
- Modify: `lib/services/notification-preference.service.ts` (+ its tests), `lib/services/user-deletion.service.ts` (+ its tests), `proxy.ts`

**Interfaces:**
- Produces:
  ```ts
  export type PushPlatformInput = "ios" | "android";
  export async function registerDevice(input: { userId: string; token: string; platform: PushPlatformInput; appVersion?: string | null }): Promise<void>;
  export async function unregisterToken(token: string, userId?: string): Promise<void>;
  export async function listDevices(userId: string): Promise<{ token: string; platform: "IOS" | "ANDROID" }[]>;
  export async function removeTokens(tokens: string[]): Promise<void>;
  export function isValidPushToken(token: unknown): token is string;
  export function isPushAllowed(prefs: PreferenceValues, type: NotificationType): boolean;
  export async function registerPushDeviceAction(input: { token: string; platform: string; appVersion?: string | null }): Promise<{ success: boolean }>;
  export async function unregisterPushDeviceAction(input: { token: string }): Promise<{ success: boolean }>;
  // POST /api/push/unregister  { token }  → 204   (no auth: called after sign-out)
  ```
  `PreferenceValues` gains `pushEnabled: boolean` (default `true`, editable).

- [ ] **Step 1: Schema**

Add to `prisma/schema.prisma`:

```prisma
enum PushPlatform {
  IOS
  ANDROID
}

model PushDevice {
  id         String       @id @default(auto()) @map("_id") @db.ObjectId
  userId     String       @db.ObjectId
  user       User         @relation("PushDevices", fields: [userId], references: [id])
  token      String       @unique
  platform   PushPlatform
  appVersion String?
  lastSeenAt DateTime     @default(now())
  createdAt  DateTime     @default(now())

  @@index([userId])
}
```

Add `pushDevices PushDevice[] @relation("PushDevices")` to `User`, and `pushEnabled Boolean @default(true)` to `NotificationPreference`. Run **only** `npx prisma generate`. Do not run `db push`.

- [ ] **Step 2: Failing tests** for the service (mock `@/lib/prisma` like `lib/services/__tests__/user-deletion.service.test.ts`):
  - `registerDevice` upserts by token with `update: { userId, platform: "IOS"|"ANDROID", appVersion, lastSeenAt }` and `create` equivalents — so an existing token is reassigned to the new user.
  - `unregisterToken(token)` → `deleteMany({ where: { token } })`; with `userId` → `deleteMany({ where: { token, userId } })`.
  - `removeTokens([])` makes no query; `removeTokens(["a","b"])` → `deleteMany({ where: { token: { in: ["a","b"] } } })`.
  - `isValidPushToken`: accepts a 64-char hex APNs token and a 160-char FCM-style token with `:`, `-`, `_`; rejects `""`, non-strings, whitespace, and strings over 4096 chars.

- [ ] **Step 3: Implement** `lib/services/push-device.service.ts` to pass them (`isValidPushToken`: `typeof t === "string" && t.length > 0 && t.length <= 4096 && /^[A-Za-z0-9:_\-.]+$/.test(t)`).

- [ ] **Step 4: Preferences.** In `notification-preference.service.ts`: add `pushEnabled` to `PreferenceValues`, `PREFERENCE_DEFAULTS` (`true`), `EDITABLE_KEYS`, and `toValues`. Add:
  ```ts
  /** Whether this type may be pushed, given these preferences. Pure. */
  export function isPushAllowed(prefs: PreferenceValues, type: NotificationType): boolean {
    const entry = NOTIFICATION_REGISTRY[type];
    if (!entry) return false;
    if (entry.transactional) return true;
    if (!prefs.pushEnabled) return false;
    return prefs[entry.category];
  }
  ```
  Tests: billing type → true even with `pushEnabled: false`; `pushEnabled: false` → false for a messages type; category off → false; unknown type → false. Existing preference tests must keep passing (update fixtures for the new field).

- [ ] **Step 5: Actions and endpoint.**
  - `actions/push-actions.ts` (`"use server"`): `registerPushDeviceAction` → `getCurrentUser()`, validate token with `isValidPushToken` and platform ∈ {ios, android}, then `registerDevice`; returns `{ success: false }` on invalid input. `unregisterPushDeviceAction` → `getCurrentUser()`, `unregisterToken(token, user.id)`.
  - `app/api/push/unregister/route.ts`: `POST` reads `{ token }`, returns 400 if `!isValidPushToken`, else `unregisterToken(token)` and 204. No auth: it is called right after sign-out, and possessing the token is proof of the device. Add `"/api/push/unregister"` to the public routes in `proxy.ts`.
  - Tests for both, including: invalid platform rejected; unauthenticated calls to the action go through `getCurrentUser` (mocked); the endpoint returns 400 on a malformed body.

- [ ] **Step 6: Account deletion.** In `lib/services/user-deletion.service.ts` `deleteUserData`, add `await prisma.pushDevice.deleteMany({ where: { userId } });` before `prisma.user.delete`. Add the model to that test file's Prisma mock and assert the call happens before `user.delete` (`invocationCallOrder`).

- [ ] **Step 7: Verify and commit.** `npx tsc --noEmit -p tsconfig.json` (delete `.next/types` first if it reports stale pages), `npx vitest run lib/services actions app/api/push`, eslint on changed files.

```bash
git add prisma/schema.prisma lib/services actions/push-actions.ts actions/__tests__/push-actions.test.ts app/api/push proxy.ts
git commit -m "feat: register push devices and add a push preference"
```

---

### Task 2: Push delivery service (FCM for Android, APNs for iOS)

**Files:**
- Create: `lib/services/push.service.ts`, `lib/services/__tests__/push.service.test.ts`
- Modify: `package.json`, `package-lock.json` (add `firebase-admin`)

**Interfaces:**
- Consumes: `listDevices`, `removeTokens` (Task 1).
- Produces:
  ```ts
  export interface PushMessage { title: string; body?: string; link?: string }
  export type SendOutcome = { token: string; ok: true } | { token: string; ok: false; dead: boolean };
  export function buildFcmMessage(token: string, msg: PushMessage): object;
  export function buildApnsPayload(msg: PushMessage): object;
  export function apnsJwt(args: { keyP8: string; keyId: string; teamId: string; nowSeconds: number }): string;
  export function isDeadFcmError(code: string | undefined): boolean;
  export function isDeadApnsResponse(status: number, reason: string | undefined): boolean;
  export interface PushTransports { sendFcm(tokens: string[], msg: PushMessage): Promise<SendOutcome[]> | null; sendApns(tokens: string[], msg: PushMessage): Promise<SendOutcome[]> | null }
  export async function sendPushToUser(userId: string, msg: PushMessage, transports?: PushTransports): Promise<void>;
  ```
  A transport returns `null` when its platform is not configured.

- [ ] **Step 1: Install** `npm install --save-exact firebase-admin@latest` at the root. Record the installed version in the report.

- [ ] **Step 2: Failing tests** (all pure or with injected fakes; no network):
  - `buildFcmMessage("t", { title: "Hi", body: "B", link: "/messages/1" })` equals `{ token: "t", notification: { title: "Hi", body: "B" }, data: { link: "/messages/1" }, android: { priority: "high", notification: { channelId: "default", icon: "ic_stat_notify" } } }`; with no `link`, `data` is `{}`; with no `body`, `notification.body` is omitted.
  - `buildApnsPayload({ title: "Hi", body: "B", link: "/x" })` equals `{ aps: { alert: { title: "Hi", body: "B" }, sound: "default" }, link: "/x" }`.
  - `apnsJwt`: generate an EC P-256 key in the test with `crypto.generateKeyPairSync("ec", { namedCurve: "P-256" })`, export the private key as PKCS8 PEM, pass it base64-encoded as `keyP8`; the returned JWT has header `{ alg: "ES256", kid }`, payload `{ iss: teamId, iat: nowSeconds }`, and its signature verifies with the public key using `crypto.verify("sha256", …, { key, dsaEncoding: "ieee-p1363" })`.
  - `isDeadFcmError`: true for the three listed codes, false for `messaging/internal-error` and `undefined`.
  - `isDeadApnsResponse`: true for status 410 and for status 400 with reason `BadDeviceToken` or `DeviceTokenNotForTopic`; false for 200, 429, 500.
  - `sendPushToUser` with fakes: no devices → no transport call; Android and iOS tokens are split to the right transports; dead outcomes are passed to `removeTokens` and live/transient failures are not; a transport returning `null` (unconfigured) is skipped without error; a transport that throws does not make `sendPushToUser` throw and does not prune.

- [ ] **Step 3: Implement.**
  - Pure builders and classifiers exactly as tested.
  - `apnsJwt`: header and payload JSON base64url-encoded; sign `${h}.${p}` with `crypto.sign("sha256", data, { key: pem, dsaEncoding: "ieee-p1363" })`; `pem = Buffer.from(keyP8, "base64").toString("utf8")`.
  - Default transports, created lazily and cached per process:
    - FCM: if `FIREBASE_SERVICE_ACCOUNT_JSON` is unset, return `null` and log `[push] FCM not configured` once. Otherwise initialise `firebase-admin/app` with `cert(JSON.parse(Buffer.from(env, "base64").toString("utf8")))` under a named app `"push"` (avoid clashing with any default app), and send with `getMessaging(app).sendEach(tokens.map((t) => buildFcmMessage(t, msg)))`, mapping each response to `SendOutcome` using `isDeadFcmError(error?.code)`.
    - APNs: if any of `APNS_KEY_P8`, `APNS_KEY_ID`, `APPLE_TEAM_ID` is unset, return `null` and log once. Otherwise open one `http2.connect(host)` per send batch (`https://api.sandbox.push.apple.com` when `APNS_SANDBOX === "1"`, else `https://api.push.apple.com`), `POST /3/device/<token>` with headers `authorization: bearer <jwt>`, `apns-topic: com.goinmotus.app`, `apns-push-type: alert`, `apns-priority: 10`, body `JSON.stringify(buildApnsPayload(msg))`; read `:status` and the JSON `reason`; map with `isDeadApnsResponse`; close the session afterwards. Cache the JWT and re-sign after 50 minutes. Put a 10-second timeout on the whole batch.
  - `sendPushToUser`: `listDevices` → split by platform → call transports in parallel → collect dead tokens → `removeTokens(dead)`. Wrap everything in try/catch and log with a `[push]` prefix; never rethrow.
  Keep the network code small and isolated so the pure parts carry the tests; state in the report that the live transports were not exercised against real APNs/FCM.

- [ ] **Step 4: Verify and commit.** `npx vitest run lib/services/__tests__/push.service.test.ts`, tsc, eslint, `npm run build` (confirm `firebase-admin` bundles for the Node runtime without errors).

```bash
git add lib/services/push.service.ts lib/services/__tests__/push.service.test.ts package.json package-lock.json
git commit -m "feat: deliver push notifications via FCM on Android and APNs on iOS"
```

---

### Task 3: Send a push for every notification

**Files:**
- Modify: `lib/services/notification.service.ts` (`notifyUser`), its test file(s) under `lib/services/__tests__/` (find the existing `notifyUser` tests, e.g. `notify-user.test.ts`)

**Interfaces:**
- Consumes: `sendPushToUser`, `PushMessage` (Task 2); `isPushAllowed`, `getPreference` (Task 1 / existing).

- [ ] **Step 1: Failing tests** added to the existing `notifyUser` test file (mock `@/lib/services/push.service` and whatever that file already mocks):
  - a messages-category notification with default preferences → `sendPushToUser(userId, { title, body, link })` called once with the notification's own title/body/link;
  - preferences with `pushEnabled: false` → no push, email path unaffected;
  - category toggled off → no push;
  - a billing (transactional) type → push even when `pushEnabled` is false;
  - `sendPushToUser` rejecting → `notifyUser` resolves, and the email is still sent;
  - a type whose registry entry has no email template → push is still sent;
  - email cooldown suppressing the email → push is still sent.

- [ ] **Step 2: Implement.** In `notifyUser`, immediately after the in-app notification is created (step 1), add an independent, self-contained push step:
  ```ts
    // Push: independent of email. Never throws, ignores email cooldowns.
    try {
      if (isPushAllowed(await getPreference(input.userId), input.type)) {
        await sendPushToUser(input.userId, { title: input.title, body: input.body ?? undefined, link: input.link ?? undefined });
      }
    } catch (err) {
      console.error(`[notify] push step failed for ${input.type} / user ${input.userId}:`, err);
    }
  ```
  Read the function first and keep every existing email behaviour identical. If `getPreference` is also read later in the email path, it's acceptable to read it twice; do not restructure the email flow.

- [ ] **Step 3: Verify and commit.** `npx vitest run lib/services actions` (message and voice-memo actions call `notifyUser` and must stay green), tsc, eslint.

```bash
git add lib/services/notification.service.ts lib/services/__tests__
git commit -m "feat: send a push notification alongside every in-app notification"
```

---

### Task 4: Native push wiring

**Files:**
- Modify: `package.json`, `package-lock.json`, `mobile/package.json`, `mobile/package-lock.json`, `mobile/capacitor.config.ts`, `mobile/ios/App/App/AppDelegate.swift`, `mobile/ios/App/App/App.entitlements`, `mobile/android/app/src/main/AndroidManifest.xml`, `mobile/.gitignore`, `mobile/scripts/verify.cjs` + `verify.test.cjs`, `mobile/README.md`, generated plugin registration under `mobile/ios/**` and `mobile/android/**`
- Create: `mobile/android/app/src/main/res/drawable/ic_stat_notify.xml`

**Interfaces:**
- Produces: `checkPush({ appDelegate, entitlements, manifest })` and a release-only `google-services.json` presence check in `verify.cjs`.

- [ ] **Step 1: Install** `@capacitor/push-notifications@8.1.2` with `--save-exact` at the root and in `mobile/`.

- [ ] **Step 2: Config.** In `mobile/capacitor.config.ts` `plugins`, add `PushNotifications: { presentationOptions: [] }` (foreground notifications are shown in-app as a toast instead of a system banner). Add a matching assertion to `checkResolvedConfig` and the test fixture.

- [ ] **Step 3: iOS.** In `AppDelegate.swift`, add inside the class:
  ```swift
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
  ```
  In `App.entitlements` (already referenced only by the Release configuration), add `<key>aps-environment</key><string>development</string>` (Xcode rewrites it to `production` on App Store/TestFlight export). Validate with `plutil -lint`.

- [ ] **Step 4: Android.** In `AndroidManifest.xml`: add `<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />`, and inside `<application>`:
  ```xml
        <meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/ic_stat_notify" />
        <meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="default" />
  ```
  Create `res/drawable/ic_stat_notify.xml`: a 24dp monochrome white vector (a simple bell or ring shape; status-bar icons must be single-colour on transparent).

- [ ] **Step 5: Secrets stay out of git.** Add to `mobile/.gitignore`: `android/app/google-services.json`, `ios/App/App/GoogleService-Info.plist`, `*.p8`, `*.keystore`, `*.jks`. (The generated `android/.gitignore` has the google-services line commented out, so it must be ignored here.) Confirm with `git check-ignore`.

- [ ] **Step 6: verify.cjs.** Add `checkPush` (normal mode): AppDelegate contains both `capacitorDidRegisterForRemoteNotifications` and `capacitorDidFailToRegisterForRemoteNotifications`; entitlements contain `aps-environment`; manifest contains `POST_NOTIFICATIONS`, the default icon meta-data and the channel meta-data. In `--release` mode also require `android/app/google-services.json` to exist (Android push cannot work without it). Tests for each check.

- [ ] **Step 7: README.** Add a "Push notifications" section: Android — create the Firebase Android app, download `google-services.json` into `mobile/android/app/` (git-ignored), create a service account key and set `FIREBASE_SERVICE_ACCOUNT_JSON` (base64) in Vercel; iOS — create the APNs Auth Key, set `APNS_KEY_P8` (base64 of the `.p8`), `APNS_KEY_ID`, `APPLE_TEAM_ID`, and `APNS_SANDBOX` left unset in Production (`=1` only on a non-production deployment for development-signed builds); enable the Push Notifications capability on the App ID; push only works in Release/TestFlight builds (free-Apple-ID Debug builds cannot sign it); env changes need a redeploy; schema change needs `npx prisma db push` by the owner.

- [ ] **Step 8: Verify and commit.** `cd mobile && npm run sync && npm test && npm run verify` (release mode will fail here without `google-services.json` and the production Clerk key — expected; report it).

```bash
git add package.json package-lock.json mobile
git commit -m "feat: wire native push notifications into the iOS and Android projects"
```

---

### Task 5: Client registration, taps, the permission prompt and the settings toggle

**Files:**
- Create: `lib/native/push.ts`, `lib/native/__tests__/push.test.ts`, `components/native/push-prompt.tsx`, `components/native/__tests__/push-prompt.test.tsx`
- Modify: `components/providers/native-provider.tsx`, `app/(platform)/dashboard/page.tsx` (mount the prompt), `components/settings/notification-preferences-form.tsx` (+ test), the notification preference action it calls

**Interfaces:**
- Consumes: `registerPushDeviceAction` (Task 1), `pathFromAppUrl` (`lib/native/deep-links.ts`).
- Produces:
  ```ts
  export const PUSH_TOKEN_KEY = "inmotus:push-token";
  export function linkToPath(link: string | undefined | null): string | null;
  export interface PushDeps { /* plugin subset + callbacks */ }
  export async function registerPush(deps: PushDeps): Promise<() => void>;
  export async function requestPushPermission(deps: PushDeps): Promise<"granted" | "denied" | "prompt">;
  export function shouldShowPushPrompt(args: { isNative: boolean; permission: "granted" | "denied" | "prompt" | "prompt-with-rationale" | null; dismissed: boolean; visits: number }): boolean;
  export function PushPrompt(): JSX.Element | null;
  ```

- [ ] **Step 1: Failing tests for the pure parts**
  - `linkToPath("/messages/1?x=1")` → `"/messages/1?x=1"`; `linkToPath("https://app.goinmotus.com/clients/2")` → `"/clients/2"`; `linkToPath("https://evil.com/x")`, `linkToPath("//evil.com")`, `linkToPath("/\\evil.com")`, `linkToPath("javascript:alert(1)")`, `""`, `null` → `null`. Implementation: resolve with `new URL(link, "https://app.goinmotus.com")` inside try, then pass `resolved.toString()` through `pathFromAppUrl` (the fuzzed gate), returning its result.
  - `shouldShowPushPrompt`: only when native, permission is `prompt` or `prompt-with-rationale`, not dismissed, and visits ≥ 2.

- [ ] **Step 2: Failing tests for `registerPush` with fakes** (listener fakes like `lib/native/__tests__/lifecycle.test.ts`):
  - permission already `granted` → `createChannel({ id: "default", name: "Notifications", importance: 5 })` on Android and `register()` called; `prompt` → `register()` not called;
  - `registration` event → `onToken(token)` called and the token stored via the injected storage;
  - `pushNotificationReceived` (foreground) → `onForeground({ title, body, path })` with `path` from `linkToPath(data.link)`;
  - `pushNotificationActionPerformed` with a safe link → `navigate(path)`; with a hostile link → no navigate; with no link → `navigate("/dashboard")`;
  - cleanup removes every listener; a rejecting plugin call never makes `registerPush` reject.
  `requestPushPermission`: `granted` → registers; `denied` → does not.

- [ ] **Step 3: Implement `lib/native/push.ts`** to pass them, dependency-injected like `lifecycle.ts`.

- [ ] **Step 4: Provider wiring.** In `NativeProvider` (read it fully first; keep existing effects):
  - use Clerk's `useAuth()`; when `Capacitor.isNativePlatform()` and `isSignedIn`, dynamically import `@capacitor/push-notifications` and call `registerPush` with: `onToken` → `registerPushDeviceAction({ token, platform, appVersion })` and store the token under `PUSH_TOKEN_KEY` (try/catch around storage); `onForeground` → `toast(title, { description: body, action: path ? { label: "View", onClick: () => router.push(path) } : undefined })` from `sonner`; `navigate` → `router.push`.
  - when `isSignedIn` goes from true to false, read the stored token and `fetch("/api/push/unregister", { method: "POST", body: JSON.stringify({ token }), headers: { "content-type": "application/json" } })`, then clear it. Failures are ignored.
  - Test what can be tested statically; the effect logic is covered by `registerPush` tests. Say so in the report.

- [ ] **Step 5: The soft prompt.** `components/native/push-prompt.tsx` (client): on native, read the plugin's `checkPermissions()`, a visit counter and a dismissed flag in `localStorage` (keys `inmotus:push-prompt-visits`, `inmotus:push-prompt-dismissed`, all wrapped in try/catch), increment the counter on mount, and when `shouldShowPushPrompt` is true show a bottom sheet (existing `Sheet` component, semantic tokens only): title "Get reminders for workouts and messages", body "Inmotus RX can notify you about new messages, check-ins and upcoming sessions.", buttons "Turn on" (→ `requestPushPermission`, then close) and "Not now" (→ set dismissed, close). Mount it in `app/(platform)/dashboard/page.tsx`. Test: static render on web renders nothing; the pure `shouldShowPushPrompt` carries the logic.

- [ ] **Step 6: Settings toggle.** In `components/settings/notification-preferences-form.tsx`, add a "Push notifications" switch bound to `pushEnabled`, above the category toggles, with helper text "Applies to all your devices. Category switches below apply to email and push." Make sure the server action that saves preferences accepts `pushEnabled` (it uses `EDITABLE_KEYS`). Update the form's test for the new switch.

- [ ] **Step 7: Verify and commit.** `npx vitest run lib/native components app`, tsc, eslint on each changed file, `npm run build`.

```bash
git add lib/native/push.ts lib/native/__tests__/push.test.ts components/native components/providers "app/(platform)/dashboard/page.tsx" components/settings actions
git commit -m "feat: register for push, handle taps, prompt for permission and add a push toggle"
```

---

### Task 6: Full verification

- [ ] `cd mobile && npm run sync && npm test && npm run verify` → OK (report `verify:release` output; failures from the missing `google-services.json` and the dev-only Clerk key are expected).
- [ ] `npx prisma validate` → valid. Confirm **no** database command was run.
- [ ] `npx tsc --noEmit -p tsconfig.json`; `npx vitest run` (known timezone failures only); `npm run build`.
- [ ] Lint every web file changed since the plan base, individually and quoted.
- [ ] `git status --short` clean apart from untracked plan docs; `git check-ignore mobile/android/app/google-services.json` confirms it is ignored.
- [ ] Owner-only list: run `npx prisma db push`; create Firebase Android app + service account; APNs key + env vars; enable Push capability on the App ID; test from TestFlight and an Android build: permission prompt, foreground toast, background banner, tap from a cold start lands on the right screen, sign out/sign in as another user on the same phone stops the first user's pushes, toggling push off stops pushes.

---

## Self-review

- **Spec §8:** data model (Task 1, on `NotificationPreference` per deviation 2), registration flow and soft prompt (Task 5), sending service with pruning and lazy config (Task 2, APNs per deviation 1), triggers via the single `notifyUser` path which already covers messages and voice memos (Task 3), receiving: foreground toast and tap deep link (Task 5), Firebase/APNs setup (Task 4 README), account deletion cleanup (Task 1). Badge deferred per deviation 3. ✔
- **Review Focus:** 1 → Tasks 1 and 5; 2 → Task 5; 3 → Task 2; 4 → Task 3; 5 → Tasks 1 and 3. ✔
- **Type consistency:** `registerDevice`, `unregisterToken`, `listDevices`, `removeTokens`, `isValidPushToken`, `isPushAllowed`, `PushMessage`, `SendOutcome`, `sendPushToUser`, `linkToPath`, `registerPush`, `requestPushPermission`, `shouldShowPushPrompt` used identically across tasks. ✔

---

## Execution rulings (recorded 2026-09-27)

- Ruling R1: push runs concurrently with the email step, not before it sequentially — every caller awaits notifyUser inline (message send, check-ins, webhook), so a sequential APNs/FCM round trip would add up to the 10s timeout to user actions. Start the push promise right after createNotification and await it in a finally before notifyUser returns — costs: nothing if wrong beyond slightly more code.
- Ruling R2: T1 adds pushEnabled to BOTH EDITABLE_KEYS lists (service + actions/notification-preference-actions.ts) and the action's doc comment — otherwise the settings toggle silently never saves. Cost if wrong: none.
- Ruling R3: push is sent for in-app-only types (registry template null) too — push mirrors the in-app notification, not the email. Cost if wrong: extra pushes for in-app-only types; trivially gated later.
- Ruling R5: do NOT prune on messaging/invalid-argument (FCM also uses it for malformed payloads → one bad message would wipe a user's Android tokens). Prune only registration-token-not-registered and invalid-registration-token. Plan deviation; cost if wrong: a few stale tokens linger until they return not-registered.
- Ruling R6: firebase-admin 14 needs Node ≥22; Vercel default is Node 24 — accepted, noted for owner.
- Final review fixes: APNs defaults to production (`APNS_SANDBOX=1` opt-in, `APNS_PRODUCTION` removed); Android push gated on a ` push` user-agent marker written at `npm run sync` only when google-services.json exists (re-sync after adding it); Settings push switch requests OS permission and shows a denied hint; aps-environment is `development` in App.entitlements; sign-out unregister retries until 2xx, covers signed-out loads, forgets permanently rejected tokens.
- Regression caught in Task 6: notifyUser → push.service ("server-only") broke test imports; fixed with a Vitest alias to server-only/empty.js and server-only declared as a dependency.
- Open (owner/device): F3 needs two taps when pushEnabled is already on but OS permission undecided (toggle off/on) — consider an "Allow on this device" affordance; switching push off only gates server-side (no device unregister, spec §6); narrow re-sign-in race where a slow unregister can delete the next user's row (self-heals on next launch).
