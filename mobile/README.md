# Inmotus RX — mobile (iOS + Android)

## 1. What this is

This is a native shell (Capacitor) around the hosted Inmotus RX web app at `https://app.goinmotus.com`. Web changes ship the normal way — a Vercel deploy — and every phone picks them up the next time the app loads. Native changes (this folder: icons, splash, permissions, plugin config) only take effect after you build and upload a new version through Xcode / Android Studio.

## 2. One-time setup (owner's Mac)

- Install **Xcode** from the App Store, then in Terminal:
  ```
  sudo xcode-select -s /Applications/Xcode.app
  xcodebuild -runFirstLaunch
  ```
- Install **Android Studio**. Open it → SDK Manager → install the latest SDK Platform and Build-Tools.
- Add to your shell profile (`~/.zshrc` or `~/.zprofile`):
  ```
  export ANDROID_HOME="$HOME/Library/Android/sdk"
  export PATH="$ANDROID_HOME/platform-tools:$PATH"
  ```
  Android Studio bundles its own JDK, so no separate Java install is needed to build from Studio.
- iOS uses Swift Package Manager for its dependencies, so **CocoaPods is not required**.
- Install dependencies:
  ```
  cd mobile && npm install
  ```

## 3. Run on your own phone

**iPhone**
```
npm run sync && npm run open:ios
```
Xcode opens. Select the `App` target → **Signing & Capabilities** → pick your own team (a free Apple ID works for installing on your own device — it does not need the paid Apple Developer Program). If `com.goinmotus.app` is already registered under the company's Apple Developer team (Plan 0), a free Personal Team cannot sign it — choose the company team instead. Plug your iPhone in with a cable, select it as the run destination, and press **Run** (▶).

The first time, the app installs but iOS refuses to open it and shows **"Untrusted Developer"**. On the phone go to **Settings → General → VPN & Device Management**, tap your Apple ID under "Developer App", and tap **Trust**. After that it opens normally.

A free (non-paid) Apple ID's signing expires after **7 days** — the app simply stops opening on the phone. There's nothing wrong; just plug the phone back into Xcode and press **Run** again to re-sign it.

**Android**
On the phone: Settings → About phone → tap **Build number** 7 times to enable Developer options, then turn on **USB debugging** under Developer options.
```
npm run sync && npm run open:android
```
Android Studio opens the project. Plug the phone in, select it as the run target, and press **Run** (▶).

## 4. Point the app at your laptop (live reload)

Your iPhone/Android phone and your Mac must be on the **same Wi-Fi network** — not cellular, and not a "guest" or client-isolated Wi-Fi network (common on office/coffee-shop Wi-Fi, which blocks devices from reaching each other). Use your home network if in doubt.

From the repo root:
```
npm run dev:lan
```
This starts Next.js listening on your LAN, not just `localhost`. The first time you run it, macOS may pop up **"Do you want the application node to accept incoming network connections?"** — click **Allow** (if you click Deny, the phone can never reach it).

Find your Mac's LAN IP:
```
ipconfig getifaddr en0
```
Then, in `mobile/`:
```
CAP_SERVER_URL=http://<ip>:3000 npm run sync
```
Run the app from Xcode or Android Studio as in section 3 — it now loads your laptop instead of production.

**Afterwards, restore production before any release build:**
```
npm run sync
npm run verify:release
```
(no `CAP_SERVER_URL` set — this falls back to `https://app.goinmotus.com`; `verify:release` confirms nothing dev/preview is left wired in — see section 9).

Warnings:
- A dev build pointed at your laptop must **never** be uploaded to the App Store or Play Console.
- `npm run verify:release` refuses any non-production URL (a laptop IP, a preview URL) — that's a safety check, not a bug, if it fails while you're still pointed at a dev URL. (`npm run verify` alone does not check this — see section 9.)

## 5. Preview builds

Same idea, pointed at a Vercel preview deployment instead of your laptop:
```
CAP_SERVER_URL=https://<vercel-preview-url> npm run sync
```
Then run from Xcode/Android Studio as above. Restore production the same way as section 4 before any release build.

## 6. Versioning

1. Bump `"version"` in `mobile/package.json` — format `x.y.z`, and keep minor and patch below 100 (see formula below).
2. Run:
   ```
   npm run version:set
   ```
3. Commit the version bump along with the stamped iOS/Android project files.

The build number Xcode's `CURRENT_PROJECT_VERSION` and Android's `versionCode` get stamped with is:
```
build number = major * 10000 + minor * 100 + patch
```
This only increases as long as minor and patch stay under 100, which both stores require for every new upload.

## 7. Icons and splash

The current icon and splash art in `mobile/resources/` is a placeholder (a plain "RX" mark). To replace it with real brand art:

- `resources/icon.png` — 1024×1024, no transparency.
- `resources/splash.png` and `resources/splash-dark.png` — 2732×2732, logo centred within the middle ~1200px (the outer area gets cropped/masked differently per device).

Then regenerate every platform's icon and splash assets:
```
npm run assets
```

## 8. Release builds

Before either platform, make sure you're pointed at production: `npm run sync && npm run verify:release` must print OK (see section 9).

**iOS** — requires an active Apple Developer Program membership (from Plan 0).
1. In Xcode, select **Any iOS Device (arm64)** as the run destination (not a simulator or your plugged-in phone) — otherwise **Product → Archive** is greyed out.
2. **Product → Archive**.
3. **Distribute App → App Store Connect → Upload**.
4. In App Store Connect, add the build to **TestFlight** for internal testing before any public release.

**Android** — requires a Play Console account (from Plan 0).
1. In Android Studio: **Build → Generate Signed Bundle / APK → Android App Bundle**.
2. The first time, create a new upload keystore and **back it up somewhere safe outside the repo** — losing it means you can never update the app under the same listing again. Never commit it.
3. Upload the resulting `.aab` to the Play Console under **Internal testing**.

## 9. Before every store build — checklist

```
npm run sync            # no CAP_SERVER_URL set — resolves to production
npm run verify:release  # must print "mobile verify OK" — refuses any non-production URL
npm test                 # must pass
```
`npm run verify:release` does everything `npm run verify` does, plus it fails if `server.url` is anything other than `https://app.goinmotus.com` (a laptop IP, a preview URL, anything left over from sections 4/5) — `npm run verify` alone would not catch that. It also checks that the version stamped into the Xcode project and the Gradle project matches `mobile/package.json`'s `"version"` (section 6) — a bumped-but-unstamped version is flagged on both platforms.

### Device checklist (sign-in)

On a real device, signed in, check each by hand before submitting:

- **Settings → profile**: the connected-accounts section (Google) is hidden.
- **Sign-in → "Use another method"** for a Google-linked account: no Google option is offered.
- **Clerk's reverification prompt** (e.g. changing the password) for a Google-only account: it appears and can be completed, or fails cleanly, without leaving the app for Google.

## 10. Debugging the app

- **iOS**: on the iPhone, **Settings → Safari → Advanced** and turn on **Web Inspector**. On the Mac, in Safari: **Settings → Advanced** → show the **Develop** menu, then **Develop → \<your iPhone\> → \<the page\>**. This only attaches to Debug builds.
- **Android**: enable USB debugging on the phone (section 3), plug it in, then open `chrome://inspect` in desktop Chrome and select the page under the connected device.

## 11. Troubleshooting

- **`[error] Parsing capacitor.config.ts failed … Cannot use import statement outside a module`** — TypeScript 7 got installed in `mobile/`. `cap sync` keeps using the previous resolved config when this happens, so it can silently mask changes. Keep `typescript@^5` in `mobile/package.json`.
- **App icon appears but won't open / "Untrusted Developer"** — expected the first time you install with a free/personal Apple ID. On the phone: **Settings → General → VPN & Device Management** → tap your Apple ID developer profile → **Trust**. If it recurs a week later, your free Apple ID's signing has simply expired after its 7-day limit — re-run from Xcode.
- **Live-reload build shows the offline page** — usually the phone and Mac aren't on the same Wi-Fi network (check for cellular data or a guest/isolated network on the phone), or macOS was told to block incoming connections for `node` (System Settings → Network → Firewall → Options, allow incoming connections for node, or re-trigger the "Allow" prompt by restarting `npm run dev:lan`).
- **`npm test` fails or behaves oddly on Node 22+** — it must use the quoted glob form, `node --test 'scripts/*.test.cjs'` (already how the script is defined). The unquoted directory form (`node --test scripts/`) fails on newer Node versions — don't "simplify" it back.
- **Sign-in opens Safari/Chrome instead of staying in the app** — the Clerk host wasn't resolved at sync time. `allowNavigation` holds `app.goinmotus.com`, `*.goinmotus.com` and exactly one Clerk host, decoded from `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (there are deliberately no `*.accounts.dev` wildcards — anyone can register a Clerk instance there). Make sure the publishable key is in the repo-root `.env.local` (or `.env`, or your shell environment) and run `npm run sync` again; it prints `clerk frontend-API host -> <host>` when it found one and a warning when it didn't. `npm run verify:release` additionally refuses any `accounts.dev` host — a store build must use the production Clerk instance on a goinmotus.com domain.
- **Android: no push prompt, no "Push notifications" registration** — the build was synced without `android/app/google-services.json`, so push is disabled in that build (`npm run verify` warns "Android push disabled in this build"). Place the file (section 13), run `npm run sync` again, and rebuild.
- **Blank screen on launch** — run `npm run verify`; it prints `mobile verify OK` or a list of problems, including whether `server.url` is `https://app.goinmotus.com` for any build headed to a store. The resolved config files it checks live at `ios/App/App/capacitor.config.json` and `android/app/src/main/assets/capacitor.config.json` — read those directly if you need to see the actual values.

`npm run verify` checks the *resolved* config that `cap sync` actually wrote (not just the source file), including: the server URL and cleartext flag, the allowed navigation hosts, the offline page and its bundled `server-url.js`, splash screen / status bar / safe-area plugin settings, the required `Info.plist` usage-description strings, the required Android permissions, and the link wiring (section 12: the Associated Domains entitlement referenced exactly once, the `inmotus` scheme on both platforms, and an Android `pathPrefix` for exactly the entries in `lib/native/deep-link-paths.json`; no allowNavigation wildcard other than `*.goinmotus.com`). It prints either `mobile verify OK` or a list of problems — it does not print the resolved config itself.

## 12. Links that open the app

Three kinds of link open inside the app instead of the browser:

- **Universal links (iOS)** and **app links (Android)** — ordinary `https://app.goinmotus.com/...` links under the prefixes listed in `lib/native/deep-link-paths.json` (`/dashboard`, `/programs`, `/messages`, `/clients`, ...). That JSON file is the single list: the web app serves it to Apple, and `npm run verify` fails if the Android manifest's `pathPrefix` lines drift from it in either direction. `/settings` (the billing link in payment-failed emails) and `/p` (trainers' public sales pages) are deliberately **not** in the list: both must open in the browser, where the card can be updated or the program bought.
- **`inmotus://` links** — e.g. `inmotus://dashboard` or `inmotus://clients/42`. These work in every build, Debug included, with no server setup.

The app only ever follows these links to a path on its own site; a link to any other host is ignored.

**One-time setup, before the first TestFlight / Play build that should handle https links:**

1. In Vercel → the web project → Settings → Environment Variables, add for **Production**:
   - `APPLE_TEAM_ID` — the 10-character Team ID from Apple Developer → **Membership**.
   - `ANDROID_SHA256_CERT_FINGERPRINTS` — Play Console → your app → **Test and release → App integrity → App signing** → *App signing key certificate* → **SHA-256 certificate fingerprint** (looks like `AB:CD:...`). If you also want links to open locally built release APKs, add your upload key's SHA-256 too, comma-separated.
2. Redeploy, then open both in a browser — each must load as JSON (not a 404 and not a sign-in page):
   - `https://app.goinmotus.com/.well-known/apple-app-site-association`
   - `https://app.goinmotus.com/.well-known/assetlinks.json`

   Until the variables are set these URLs return 404. That's harmless: the app still works, https links just open in the browser instead.

**Why universal links only work in TestFlight / Release builds:** the Associated Domains entitlement (`ios/App/App/App.entitlements`) is attached only to the **Release** build configuration. A free Apple ID (Personal Team) can't sign that entitlement, so leaving it off Debug keeps free-Apple-ID Debug builds on your own phone working (section 3). The consequence is that you test https links on iOS from a TestFlight or Release build; use `inmotus://dashboard` (e.g. typed into Notes and tapped) to test link handling in a Debug build. When enabling the entitlement for Release for the first time, the Apple Developer account must have the **Associated Domains** capability on the `com.goinmotus.app` identifier — Xcode's automatic signing adds it.

## 13. Push notifications

Push is wired into both native projects (`@capacitor/push-notifications`), but each store needs its own one-time setup before it can actually deliver anything.

**Android (FCM)**

1. In the [Firebase console](https://console.firebase.google.com/), create (or open) a project, then add an Android app with package name `com.goinmotus.app`.
2. Download the generated `google-services.json` and place it at `mobile/android/app/google-services.json`. It's git-ignored (section 14) — every machine that builds a release needs its own copy.
3. Firebase console → **Project settings → Service accounts → Generate new private key**. Base64-encode the downloaded JSON file and set it as `FIREBASE_SERVICE_ACCOUNT_JSON` in Vercel (Production) — the server uses it to sign FCM v1 API calls.

**iOS (APNs)**

1. [Apple Developer](https://developer.apple.com/account) → **Certificates, Identifiers & Profiles** → your `com.goinmotus.app` identifier → enable the **Push Notifications** capability.
2. **Keys** → create a new APNs Auth Key (one key works for every app under the team). Download the `.p8` file — Apple only lets you download it once.
3. In Vercel (Production), set:
   - `APNS_KEY_P8` — base64 of the `.p8` file's contents.
   - `APNS_KEY_ID` — the Key ID shown next to the key.
   - `APPLE_TEAM_ID` — the same 10-character Team ID used for universal links (section 12).
   - Leave `APNS_SANDBOX` **unset** in Production. The server sends to Apple's production APNs host by default, which is what TestFlight, App Store and Xcode **Archive** builds need — they all get production device tokens.
   - `APNS_SANDBOX=1` — only on a non-production deployment (e.g. Preview) that serves builds signed with a **development** profile, i.e. Run from Xcode onto a device with the Release configuration. Those builds get sandbox tokens, which only the sandbox host accepts. Never set it on Production: Apple answers a production token sent to the sandbox with `BadDeviceToken`, and the server treats that as a dead device and deletes it — every iOS device would be silently unregistered. If that happens the server logs `[push] BadDeviceToken on the APNs sandbox — is APNS_SANDBOX set for a production build?`.

**Why it only works in Release/TestFlight builds:** like the Associated Domains entitlement (section 12), `App.entitlements`' `aps-environment` key is attached only to the **Release** build configuration — a free Apple ID (Personal Team) can't sign it. A Debug build on your own phone (section 3) never registers for push.

**`aps-environment` is `development` in the file on purpose.** Xcode rewrites it to `production` when it exports an archive for TestFlight / the App Store, so store builds still get production tokens. Putting `production` in the file itself commonly breaks Automatic signing when you Run or Archive with a development profile. `npm run verify` only checks that the key exists.

**Android builds without `google-services.json` have push switched off.** Without Firebase configured, the native FCM call crashes the app, so `capacitor.config.ts` only adds the ` push` marker to the Android user agent when `android/app/google-services.json` exists at sync time; the web app never registers or asks for permission without it. `npm run verify` prints a warning when the file is missing, and `npm run verify:release` fails.

As with the other Vercel-side configuration in section 14, changing any of these env vars needs a **redeploy** to take effect — saving the variable alone changes nothing for a running deployment. If a schema change is ever needed for push (device tokens, preferences), that's `npx prisma db push`, run by the project owner, not from this checklist.

## 14. Secrets that must never be committed

- The Android upload keystore file and its passwords.
- `GoogleService-Info.plist` and `google-services.json` (section 13).

Configuration that lives in Vercel (not in this repo) — not secret, but set it there, not in a committed file:

- `APPLE_TEAM_ID` and `ANDROID_SHA256_CERT_FINGERPRINTS` (Production) — needed for the link association files (section 12). Optional: when missing, `/.well-known/...` returns 404 and the app keeps working.
- `MOBILE_MIN_VERSION_IOS` and `MOBILE_MIN_VERSION_ANDROID` — the lowest app version (`x.y.z`) each store's app is allowed to run. Below it, the app shows a full-screen "Update required" block instead of the app. Optional: default to `1.0.0`, i.e. no version is blocked until you raise these.
- `NEXT_PUBLIC_IOS_STORE_URL` and `NEXT_PUBLIC_ANDROID_STORE_URL` — the App Store / Play Store listing URLs the "Update required" screen's button opens. Optional: when unset, the screen still shows but has no button.

  Set the store URLs only once the listings exist (after the first TestFlight/Play submission), and raise `MOBILE_MIN_VERSION_*` only after the new version is live and approved in **both** stores — raising it earlier locks out users on a version that isn't yet available to install. Missing or malformed values here must never lock users out; the client-side check (`lib/native/version.ts`) treats anything it can't parse as "not blocked".

Changing any of these in Vercel (`MOBILE_MIN_VERSION_*`, `NEXT_PUBLIC_*_STORE_URL`, `APPLE_TEAM_ID`, `ANDROID_SHA256_CERT_FINGERPRINTS`) takes effect only after a **redeploy** — saving the variable alone changes nothing for running deployments (and `NEXT_PUBLIC_*` values are baked in at build time).

Keep all of these out of git entirely — do not add them to this repo even temporarily.

## 15. Trainer phone QA (390 px)

Run this on an iPhone-sized device (or a 390 × 844 touch emulation) signed in as a trainer. Nothing
may scroll the whole page sideways on any screen.

**Tier 1 — should feel built for the phone**
- Dashboard: cards stack in one column; "Generate program" and "Add client" wrap under the title.
- Clients: a card list (not a table); tapping a card opens the client; the ⋯ menu opens without opening the client.
- Client detail: only "Assign program" and ⋯ in the header; "Message" and "Progress" are in the ⋯ menu.
- Client calendar tab: day view only; events can't be dragged; tapping an event opens it; the event ⋯ menu is tappable.
- Client progress: tabs read "Photos / Metrics / Notes" and scroll if needed.
- Session review (from adherence history): each set is a small card, not a wide table.
- Inbox: open a thread, record and play a voice note, and edit/delete your own message (the ⋯ is visible without hover).
- Check-in review: read answers, add notes, mark reviewed.
- Quick assign: assign a program to a client and pick a start date.
- Header: the search icon opens search; the bell opens notifications as a sheet from the bottom.

**Tier 2 — readable, light edits**
- Programs list and detail; the Schedule tab is a day-by-day list and tapping a session opens it.
- Exercise library: Edit / Add to organization are visible on cards without hover; bulk-select bar fits on screen.
- Nutrition review, analytics, settings (profile, notifications, billing, organization, audit log).

**Tier 3 — notice, no broken UI**
- Program builder (edit / new), AI generator, program upload, bulk exercise import: the "This tool is built
  for a larger screen" card shows; editing a program also shows its read-only outline.

**Touch sizing**
- In a laptop browser, turn on touch-device emulation and confirm buttons grow only there; with a mouse the
  layout matches production.
