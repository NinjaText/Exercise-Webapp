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
Xcode opens. Select the `App` target → **Signing & Capabilities** → pick your own team (a free Apple ID works for installing on your own device — it does not need the paid Apple Developer Program). Plug your iPhone in with a cable, select it as the run destination, and press **Run** (▶).

**Android**
On the phone: Settings → About phone → tap **Build number** 7 times to enable Developer options, then turn on **USB debugging** under Developer options.
```
npm run sync && npm run open:android
```
Android Studio opens the project. Plug the phone in, select it as the run target, and press **Run** (▶).

## 4. Point the app at your laptop (live reload)

From the repo root:
```
npm run dev:lan
```
This starts Next.js listening on your LAN, not just `localhost`. Find your Mac's LAN IP:
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
```
(no `CAP_SERVER_URL` set — this falls back to `https://app.goinmotus.com`).

Warnings:
- A dev build pointed at your laptop must **never** be uploaded to the App Store or Play Console.
- `npm run verify` will flag cleartext traffic on an `https://` URL as a problem — it's a safety check, not a bug, if you see it while still pointed at a `http://` dev URL.

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

**iOS** — requires an active Apple Developer Program membership (from Plan 0).
1. In Xcode: **Product → Archive**.
2. **Distribute App → App Store Connect → Upload**.
3. In App Store Connect, add the build to **TestFlight** for internal testing before any public release.

**Android** — requires a Play Console account (from Plan 0).
1. In Android Studio: **Build → Generate Signed Bundle / APK → Android App Bundle**.
2. The first time, create a new upload keystore and **back it up somewhere safe outside the repo** — losing it means you can never update the app under the same listing again. Never commit it.
3. Upload the resulting `.aab` to the Play Console under **Internal testing**.

## 9. Before every store build — checklist

```
npm run sync            # no CAP_SERVER_URL set — resolves to production
npm run verify           # must print "mobile verify OK"
npm test                 # must pass
```
And confirm the version was bumped and stamped (section 6).

## 10. Troubleshooting

- **`[error] Parsing capacitor.config.ts failed … Cannot use import statement outside a module`** — TypeScript 7 got installed in `mobile/`. `cap sync` keeps using the previous resolved config when this happens, so it can silently mask changes. Keep `typescript@^5` in `mobile/package.json`.
- **`npm test` fails or behaves oddly on Node 22+** — it must use the quoted glob form, `node --test 'scripts/*.test.cjs'` (already how the script is defined). The unquoted directory form (`node --test scripts/`) fails on newer Node versions — don't "simplify" it back.
- **Sign-in opens Safari/Chrome instead of staying in the app** — add the missing domain to `server.allowNavigation` in `mobile/capacitor.config.ts`, then `npm run sync` again.
- **Blank screen on launch** — run `npm run verify` and check `server.url` in the printed/resolved config; it should be `https://app.goinmotus.com` for any build headed to a store.

`npm run verify` checks the *resolved* config that `cap sync` actually wrote (not just the source file), including: the server URL and cleartext flag, the allowed navigation hosts, the offline page and its bundled `server-url.js`, splash screen / status bar / safe-area plugin settings, the required `Info.plist` usage-description strings, and the required Android permissions.

## 11. Secrets that must never be committed

- The Android upload keystore file and its passwords.
- Later (Plan 3, push notifications): `GoogleService-Info.plist` and `google-services.json`.

Keep all of these out of git entirely — do not add them to this repo even temporarily.
