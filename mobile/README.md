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

## 10. Debugging the app

- **iOS**: on the iPhone, **Settings → Safari → Advanced** and turn on **Web Inspector**. On the Mac, in Safari: **Settings → Advanced** → show the **Develop** menu, then **Develop → \<your iPhone\> → \<the page\>**. This only attaches to Debug builds.
- **Android**: enable USB debugging on the phone (section 3), plug it in, then open `chrome://inspect` in desktop Chrome and select the page under the connected device.

## 11. Troubleshooting

- **`[error] Parsing capacitor.config.ts failed … Cannot use import statement outside a module`** — TypeScript 7 got installed in `mobile/`. `cap sync` keeps using the previous resolved config when this happens, so it can silently mask changes. Keep `typescript@^5` in `mobile/package.json`.
- **App icon appears but won't open / "Untrusted Developer"** — expected the first time you install with a free/personal Apple ID. On the phone: **Settings → General → VPN & Device Management** → tap your Apple ID developer profile → **Trust**. If it recurs a week later, your free Apple ID's signing has simply expired after its 7-day limit — re-run from Xcode.
- **Live-reload build shows the offline page** — usually the phone and Mac aren't on the same Wi-Fi network (check for cellular data or a guest/isolated network on the phone), or macOS was told to block incoming connections for `node` (System Settings → Network → Firewall → Options, allow incoming connections for node, or re-trigger the "Allow" prompt by restarting `npm run dev:lan`).
- **`npm test` fails or behaves oddly on Node 22+** — it must use the quoted glob form, `node --test 'scripts/*.test.cjs'` (already how the script is defined). The unquoted directory form (`node --test scripts/`) fails on newer Node versions — don't "simplify" it back.
- **Sign-in opens Safari/Chrome instead of staying in the app** — add the missing domain to `server.allowNavigation` in `mobile/capacitor.config.ts`, then `npm run sync` again.
- **Blank screen on launch** — run `npm run verify`; it prints `mobile verify OK` or a list of problems, including whether `server.url` is `https://app.goinmotus.com` for any build headed to a store. The resolved config files it checks live at `ios/App/App/capacitor.config.json` and `android/app/src/main/assets/capacitor.config.json` — read those directly if you need to see the actual values.

`npm run verify` checks the *resolved* config that `cap sync` actually wrote (not just the source file), including: the server URL and cleartext flag, the allowed navigation hosts, the offline page and its bundled `server-url.js`, splash screen / status bar / safe-area plugin settings, the required `Info.plist` usage-description strings, the required Android permissions, and the link wiring (section 12: the Associated Domains entitlement referenced exactly once, the `inmotus` scheme on both platforms, and an Android `pathPrefix` for every entry in `lib/native/deep-link-paths.json`). It prints either `mobile verify OK` or a list of problems — it does not print the resolved config itself.

## 12. Links that open the app

Three kinds of link open inside the app instead of the browser:

- **Universal links (iOS)** and **app links (Android)** — ordinary `https://app.goinmotus.com/...` links under the prefixes listed in `lib/native/deep-link-paths.json` (`/dashboard`, `/programs`, `/messages`, `/clients`, `/p`, ...). That JSON file is the single list: the web app serves it to Apple, and `npm run verify` fails if the Android manifest's `pathPrefix` lines drift from it.
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

## 13. Secrets that must never be committed

- The Android upload keystore file and its passwords.
- Later (Plan 3, push notifications): `GoogleService-Info.plist` and `google-services.json`.

Configuration that lives in Vercel (not in this repo) — not secret, but set it there, not in a committed file:

- `APPLE_TEAM_ID` and `ANDROID_SHA256_CERT_FINGERPRINTS` (Production) — needed for the link association files (section 12). Optional: when missing, `/.well-known/...` returns 404 and the app keeps working.

Keep all of these out of git entirely — do not add them to this repo even temporarily.
