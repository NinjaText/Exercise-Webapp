# Mobile Native Shell Implementation Plan (Plan 2 of 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce the actual iOS and Android apps — a Capacitor shell in `mobile/` that loads `https://app.goinmotus.com`, with icons, splash, permissions, an offline page, and the native lifecycle (splash hand-off, back button, resume refresh, status bar, connectivity, external links) wired into the web app.

**Architecture:** `mobile/` is a self-contained npm package holding the Capacitor config, the generated `ios/` and `android/` projects, a bundled fallback `www/` with an offline page, and small Node scripts for config verification and version stamping. The web app gains `lib/native/lifecycle.ts`, a dependency-injected module that registers Capacitor plugin listeners and is unit-tested with fakes; `NativeProvider` calls it only when running inside the real native shell.

**Tech Stack:** Capacitor 8.5 (`@capacitor/cli`, `core`, `ios`, `android`) with plugins `app` 8.1, `splash-screen` 8.0, `status-bar` 8.0, `network` 8.0, `browser` 8.0, `keyboard` 8.0; `@capacitor/assets` 3.0 for icons; TypeScript 5 (pinned in `mobile/`); Node 24 built-in test runner for `mobile/scripts`; Next.js 16 / React 19 / Vitest 4 on the web side.

**Spec:** `docs/superpowers/specs/2026-09-20-mobile-app-capacitor-design.md` — sections 3, 5 (launch and lifecycle, links), 9 (offline), 11. Roadmap: `docs/superpowers/plans/2026-09-21-mobile-app-roadmap.md`.

## Global Constraints

- App ID / bundle ID: `com.goinmotus.app`. App name: `Inmotus RX`. Production URL: `https://app.goinmotus.com`.
- `CAP_SERVER_URL` overrides the server URL for dev and preview builds; `cleartext` is enabled only when that URL starts with `http://`.
- User-agent suffix per platform is exactly `InmotusApp/<semver> (ios)` and `InmotusApp/<semver> (android)`, where `<semver>` is `mobile/package.json` `version`. It must match the web parser regex `/InmotusApp\/(\d+\.\d+\.\d+)\s*\((ios|android)\)/i` in `lib/native/platform.ts`.
- `server.errorPath` is `offline.html`, bundled from `mobile/www/`.
- `server.allowNavigation`: `app.goinmotus.com`, `*.goinmotus.com`, `*.clerk.accounts.dev`, `*.accounts.dev`. Anything else opens in the system browser.
- `mobile/` must pin `typescript@^5` as a devDependency. **Verified:** with TypeScript 7 the Capacitor CLI falls back to Node's native loader, which fails on a CommonJS package with "Cannot use import statement outside a module" and silently keeps the previous resolved config.
- iPhone only (`TARGETED_DEVICE_FAMILY = 1`); Android phones.
- iOS `contentInset: "never"`; Android `SystemBars.insetsHandling: "css"` with `initialViewportFitValueHint: "cover"`. Web CSS prefers Capacitor's injected `--safe-area-inset-*` and falls back to `env(safe-area-inset-*)`.
- Status bar style `LIGHT` (dark text on the app's light background).
- Splash: `launchAutoHide: true`, `launchShowDuration: 5000` (raised from 3000 after final review, to avoid a white blank on slow first loads), `launchFadeOutDuration: 200`; the web app hides it earlier as soon as it mounts. **Ruling:** auto-hide stays on because on Android the offline error page has no plugin access and could never hide a manual splash.
- Resume refresh threshold: 5 minutes in the background.
- Native plugins are called only when `Capacitor.isNativePlatform()` is true — never under the `?native=` dev override, which only fakes detection in a desktop browser.
- `mobile/` is excluded from the root `tsconfig.json`, ESLint, Vitest and Vercel uploads.
- This machine has no Xcode, Java or Android SDK. Generating projects, syncing, icons and config verification all work here; compiling and running the apps happen on the owner's machine and are documented in `mobile/README.md`.
- Colors in web code only via semantic tokens; raw Tailwind palette classes fail the error-level `design/no-raw-palette` rule. `mobile/www/*.html` is outside the Next app and uses inline CSS.
- **Each task ends with one commit** covering exactly that task's files, Conventional Commit subject, ending with a `Co-Authored-By:` trailer naming the model that wrote it. Nothing is pushed. Never `git push`, `git rebase`, `git reset --hard`, or check out another branch.

## Review Focus

1. **Cold start with no network.** The user must see a branded offline page with a working Retry, and the splash must not hang forever. → Task 1 verify script asserts `errorPath`, the bundled page, its Retry control and its server-URL source; the splash ruling above covers the hang.
2. **Sign-in redirect leaves the allowed hosts.** Clerk bouncing through an accounts domain not in `allowNavigation` opens the system browser and breaks login. → Task 1 verify script asserts every required host is present.
3. **Android back button at the root screen.** It must minimise the app, not exit into a blank view or loop; with history it must go back. → Task 3 tests `decideBackAction`.
4. **External and special links.** YouTube, Stripe or any other origin must open in the system browser; same-origin links stay in-app; `mailto:`/`tel:` and relative links are left to the platform. → Task 3 tests `shouldOpenExternally` across all of these, including a look-alike host.
5. **Resuming the app.** After a long background the data must refresh; after a short one it must not, so half-typed input is not wiped. → Task 3 tests `shouldRefreshOnResume` at, below and above the threshold and with no recorded pause.

---

## File Structure

| File | Responsibility |
|---|---|
| `mobile/package.json` (create) | Own deps and scripts; `version` is the app's single version source. |
| `mobile/server-url.cjs` (create) | `DEFAULT_SERVER_URL`, `resolveServerUrl(env)` — shared by config and scripts. |
| `mobile/capacitor.config.ts` (create) | Capacitor config: URL, UA suffix, navigation, error page, plugin config. |
| `mobile/www/index.html`, `mobile/www/offline.html` (create) | Bundled fallback and offline page. |
| `mobile/scripts/write-www-config.cjs` (create) | Writes `www/server-url.js` so the offline page knows where to retry. |
| `mobile/scripts/verify.cjs` + `verify.test.cjs` (create) | Pure checks of the resolved config, Info.plist and AndroidManifest; CLI. |
| `mobile/scripts/version.cjs` + `version.test.cjs` + `set-version.cjs` (create) | Stamp versions into Xcode and Gradle projects. |
| `mobile/scripts/make-placeholder-assets.cjs` (create) | Generate placeholder icon and splash sources. |
| `mobile/resources/*.png` (create) | Icon and splash sources for `@capacitor/assets`. |
| `mobile/ios/**`, `mobile/android/**` (generate) | Native projects from `npx cap add`. |
| `mobile/.gitignore` (create) | Node modules and generated `www/server-url.js`. |
| `mobile/README.md` (create) | Setup, build, run, release runbook. |
| `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts` (modify), `.vercelignore` (create) | Exclude `mobile/`. |
| `package.json` (modify) | Root plugin deps; `dev:lan` script. |
| `lib/native/lifecycle.ts` + `lib/native/__tests__/lifecycle.test.ts` (create) | Pure decisions and DI plugin registration. |
| `components/providers/native-provider.tsx` (modify) | Call the lifecycle on real native. |
| `components/layout/offline-banner.tsx` + test (create) | Thin in-session no-connection banner. |
| `app/layout.tsx`, `app/globals.css` (modify) | Mount banner; safe-area variable fallback chain. |

---

### Task 1: Scaffold the `mobile/` package and generate the native projects

**Files:**
- Create: `mobile/package.json`, `mobile/server-url.cjs`, `mobile/capacitor.config.ts`, `mobile/www/index.html`, `mobile/www/offline.html`, `mobile/scripts/write-www-config.cjs`, `mobile/scripts/verify.cjs`, `mobile/scripts/verify.test.cjs`, `mobile/.gitignore`, `.vercelignore`
- Generate: `mobile/ios/**`, `mobile/android/**`, `mobile/package-lock.json`
- Modify: `tsconfig.json:34`, `eslint.config.mjs` (`globalIgnores` list), `vitest.config.ts` (`exclude` list)

**Interfaces:**
- Produces: `resolveServerUrl(env?: Record<string,string|undefined>): string` and `DEFAULT_SERVER_URL` from `mobile/server-url.cjs`; `checkResolvedConfig(config, platform, publicFiles): string[]`, `checkInfoPlist(text): string[]`, `checkAndroidManifest(text): string[]`, `UA_PATTERN` from `mobile/scripts/verify.cjs`. Task 2 extends `checkInfoPlist`/`checkAndroidManifest`; Task 4 documents the scripts.

- [ ] **Step 1: Create the package with pinned dependencies**

```json
{
  "name": "inmotus-rx-mobile",
  "version": "1.0.0",
  "private": true,
  "description": "Capacitor shell for the Inmotus RX iOS and Android apps. Loads the hosted web app.",
  "scripts": {
    "sync": "node scripts/write-www-config.cjs && cap sync",
    "verify": "node scripts/verify.cjs",
    "test": "node --test scripts/"
  },
  "dependencies": {
    "@capacitor/android": "8.5.2",
    "@capacitor/app": "8.1.1",
    "@capacitor/browser": "8.0.4",
    "@capacitor/core": "8.5.2",
    "@capacitor/ios": "8.5.2",
    "@capacitor/keyboard": "8.0.5",
    "@capacitor/network": "8.0.1",
    "@capacitor/splash-screen": "8.0.2",
    "@capacitor/status-bar": "8.0.3"
  },
  "devDependencies": {
    "@capacitor/assets": "3.0.5",
    "@capacitor/cli": "8.5.2",
    "typescript": "^5.9.3"
  }
}
```

Run: `npm --prefix mobile install --no-audit --no-fund`
Expected: `mobile/node_modules` and `mobile/package-lock.json` created; `node -p "require('./mobile/node_modules/typescript/package.json').version"` prints a `5.x` version.

- [ ] **Step 2: Write the shared server-URL helper and its failing test**

```js
// mobile/server-url.cjs
/**
 * Single source for the URL the native shell loads. `CAP_SERVER_URL` points a
 * dev or preview build at another host (e.g. http://192.168.1.20:3000).
 */
const DEFAULT_SERVER_URL = "https://app.goinmotus.com";

function resolveServerUrl(env = process.env) {
  const raw = (env.CAP_SERVER_URL || "").trim() || DEFAULT_SERVER_URL;
  return raw.replace(/\/+$/, "");
}

module.exports = { DEFAULT_SERVER_URL, resolveServerUrl };
```

```js
// mobile/scripts/verify.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveServerUrl, DEFAULT_SERVER_URL } = require("../server-url.cjs");
const { checkResolvedConfig, UA_PATTERN } = require("./verify.cjs");

test("resolveServerUrl defaults to production and trims trailing slashes", () => {
  assert.equal(resolveServerUrl({}), DEFAULT_SERVER_URL);
  assert.equal(resolveServerUrl({ CAP_SERVER_URL: "  " }), DEFAULT_SERVER_URL);
  assert.equal(resolveServerUrl({ CAP_SERVER_URL: "http://192.168.1.20:3000/" }), "http://192.168.1.20:3000");
});

const good = (platform) => ({
  appId: "com.goinmotus.app",
  appName: "Inmotus RX",
  [platform]: { appendUserAgent: `InmotusApp/1.0.0 (${platform})` },
  server: {
    url: "https://app.goinmotus.com",
    cleartext: false,
    errorPath: "offline.html",
    allowNavigation: ["app.goinmotus.com", "*.goinmotus.com", "*.clerk.accounts.dev", "*.accounts.dev"],
  },
});
const files = ["index.html", "offline.html", "server-url.js"];

test("a correct resolved config has no problems on either platform", () => {
  assert.deepEqual(checkResolvedConfig(good("ios"), "ios", files), []);
  assert.deepEqual(checkResolvedConfig(good("android"), "android", files), []);
});

test("UA_PATTERN matches the web parser's expectations", () => {
  assert.match("Mozilla/5.0 InmotusApp/1.0.0 (ios)", UA_PATTERN);
  assert.doesNotMatch("InmotusApp/1.0 (ios)", UA_PATTERN);
});

test("flags a missing or malformed user-agent suffix", () => {
  const c = good("ios");
  c.ios.appendUserAgent = "InmotusApp/1.0.0";
  assert.ok(checkResolvedConfig(c, "ios", files).some((p) => p.includes("user agent")));
});

test("flags a missing Clerk host in allowNavigation", () => {
  const c = good("android");
  c.server.allowNavigation = ["app.goinmotus.com"];
  const problems = checkResolvedConfig(c, "android", files);
  assert.ok(problems.some((p) => p.includes("*.clerk.accounts.dev")));
});

test("flags a missing offline page or server-url file", () => {
  assert.ok(checkResolvedConfig(good("ios"), "ios", ["index.html"]).some((p) => p.includes("offline.html")));
  assert.ok(checkResolvedConfig(good("ios"), "ios", ["index.html", "offline.html"]).some((p) => p.includes("server-url.js")));
});

test("flags cleartext on an https URL", () => {
  const c = good("ios");
  c.server.cleartext = true;
  assert.ok(checkResolvedConfig(c, "ios", files).some((p) => p.includes("cleartext")));
});
```

Run: `node --test mobile/scripts/`
Expected: FAIL — `Cannot find module './verify.cjs'`.

- [ ] **Step 3: Write the verifier**

```js
// mobile/scripts/verify.cjs
/**
 * Checks what `cap sync` actually resolved, not what the config file says.
 * Usage (after `npm run sync`): node scripts/verify.cjs
 */
const fs = require("node:fs");
const path = require("node:path");

// Must stay in step with lib/native/platform.ts in the web app.
const UA_PATTERN = /InmotusApp\/(\d+\.\d+\.\d+)\s*\((ios|android)\)/i;
const REQUIRED_HOSTS = ["app.goinmotus.com", "*.goinmotus.com", "*.clerk.accounts.dev", "*.accounts.dev"];

function checkResolvedConfig(config, platform, publicFiles) {
  const problems = [];
  if (config.appId !== "com.goinmotus.app") problems.push(`${platform}: appId is ${config.appId}`);
  if (config.appName !== "Inmotus RX") problems.push(`${platform}: appName is ${config.appName}`);

  const ua = config[platform] && config[platform].appendUserAgent;
  const m = typeof ua === "string" ? UA_PATTERN.exec(ua) : null;
  if (!m || m[2].toLowerCase() !== platform) {
    problems.push(`${platform}: user agent suffix "${ua}" does not match InmotusApp/<x.y.z> (${platform})`);
  }

  const server = config.server || {};
  if (!server.url) problems.push(`${platform}: server.url missing`);
  const isHttp = typeof server.url === "string" && server.url.startsWith("http://");
  if (Boolean(server.cleartext) !== isHttp) problems.push(`${platform}: cleartext must be ${isHttp} for ${server.url}`);
  if (server.errorPath !== "offline.html") problems.push(`${platform}: server.errorPath must be offline.html`);
  const nav = server.allowNavigation || [];
  for (const host of REQUIRED_HOSTS) {
    if (!nav.includes(host)) problems.push(`${platform}: allowNavigation missing ${host}`);
  }
  for (const f of ["offline.html", "server-url.js"]) {
    if (!publicFiles.includes(f)) problems.push(`${platform}: bundled ${f} missing — run npm run sync`);
  }
  return problems;
}

function checkInfoPlist(_text) {
  return [];
}

function checkAndroidManifest(_text) {
  return [];
}

function readIfExists(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

function main() {
  const root = path.join(__dirname, "..");
  const targets = {
    ios: { config: "ios/App/App/capacitor.config.json", public: "ios/App/App/public" },
    android: { config: "android/app/src/main/assets/capacitor.config.json", public: "android/app/src/main/assets/public" },
  };
  const problems = [];
  for (const [platform, t] of Object.entries(targets)) {
    const raw = readIfExists(path.join(root, t.config));
    if (!raw) {
      problems.push(`${platform}: ${t.config} not found — run npm run sync`);
      continue;
    }
    const pub = path.join(root, t.public);
    const files = fs.existsSync(pub) ? fs.readdirSync(pub) : [];
    problems.push(...checkResolvedConfig(JSON.parse(raw), platform, files));
    const serverUrlJs = readIfExists(path.join(pub, "server-url.js")) || "";
    const url = JSON.parse(raw).server && JSON.parse(raw).server.url;
    if (url && !serverUrlJs.includes(JSON.stringify(url))) {
      problems.push(`${platform}: bundled server-url.js does not point at ${url}`);
    }
  }
  const offline = readIfExists(path.join(root, "www/offline.html")) || "";
  if (!/id="retry"/.test(offline)) problems.push("www/offline.html has no Retry control (id=\"retry\")");
  if (!offline.includes("server-url.js")) problems.push("www/offline.html does not load server-url.js");

  problems.push(...checkInfoPlist(readIfExists(path.join(root, "ios/App/App/Info.plist")) || ""));
  problems.push(...checkAndroidManifest(readIfExists(path.join(root, "android/app/src/main/AndroidManifest.xml")) || ""));

  if (problems.length) {
    console.error("mobile verify FAILED:\n - " + problems.join("\n - "));
    process.exit(1);
  }
  console.log("mobile verify OK");
}

if (require.main === module) main();

module.exports = { UA_PATTERN, REQUIRED_HOSTS, checkResolvedConfig, checkInfoPlist, checkAndroidManifest };
```

Run: `node --test mobile/scripts/`
Expected: PASS, 7 tests.

- [ ] **Step 4: Write the Capacitor config**

```ts
// mobile/capacitor.config.ts
import type { CapacitorConfig } from "@capacitor/cli";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// CommonJS require keeps this loadable by the Capacitor CLI's TypeScript 5 transpile.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { resolveServerUrl } = require("./server-url.cjs") as { resolveServerUrl: () => string };

// mobile/package.json "version" is the single app version: it feeds the
// user-agent suffix the web app parses, and scripts/set-version.cjs stamps it
// into the Xcode and Gradle projects.
const { version } = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8")) as { version: string };
const serverUrl = resolveServerUrl();

const config: CapacitorConfig = {
  appId: "com.goinmotus.app",
  appName: "Inmotus RX",
  webDir: "www",
  backgroundColor: "#ffffff",
  ios: {
    appendUserAgent: `InmotusApp/${version} (ios)`,
    contentInset: "never",
  },
  android: {
    appendUserAgent: `InmotusApp/${version} (android)`,
  },
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
    errorPath: "offline.html",
    allowNavigation: ["app.goinmotus.com", "*.goinmotus.com", "*.clerk.accounts.dev", "*.accounts.dev"],
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 3000,
      launchFadeOutDuration: 200,
      backgroundColor: "#3F46C8",
      showSpinner: false,
    },
    StatusBar: { overlaysWebView: true, style: "LIGHT" },
    Keyboard: { resize: "body" },
    SystemBars: { insetsHandling: "css", initialViewportFitValueHint: "cover" },
  },
};

export default config;
```

- [ ] **Step 5: Write the bundled pages and the server-URL writer**

```js
// mobile/scripts/write-www-config.cjs
/** Writes www/server-url.js so the bundled offline page knows where Retry goes. */
const fs = require("node:fs");
const path = require("node:path");
const { resolveServerUrl } = require("../server-url.cjs");

const url = resolveServerUrl();
const out = path.join(__dirname, "..", "www", "server-url.js");
fs.writeFileSync(out, `window.INMOTUS_SERVER_URL = ${JSON.stringify(url)};\n`);
console.log(`wrote www/server-url.js -> ${url}`);
```

```html
<!-- mobile/www/index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>Inmotus RX</title>
    <script src="server-url.js"></script>
  </head>
  <body>
    <!-- Never shown in normal use: the shell loads server.url directly. -->
    <script>
      if (window.INMOTUS_SERVER_URL) window.location.replace(window.INMOTUS_SERVER_URL);
    </script>
  </body>
</html>
```

```html
<!-- mobile/www/offline.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>You're offline — Inmotus RX</title>
    <script src="server-url.js"></script>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body {
        margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
        padding: max(24px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom));
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        background: #f7f8fc; color: #151a2e; text-align: center;
      }
      main { max-width: 320px; }
      .mark { width: 64px; height: 64px; border-radius: 16px; background: #3F46C8; color: #fff;
        display: inline-flex; align-items: center; justify-content: center; font-weight: 800; font-size: 24px; }
      h1 { font-size: 20px; margin: 20px 0 8px; }
      p { font-size: 15px; line-height: 1.5; color: #5b6177; margin: 0 0 24px; }
      button { width: 100%; min-height: 48px; border: 0; border-radius: 12px; background: #3F46C8;
        color: #fff; font-size: 16px; font-weight: 600; }
      button:active { opacity: 0.85; }
    </style>
  </head>
  <body>
    <main>
      <div class="mark" aria-hidden="true">RX</div>
      <h1>You're offline</h1>
      <p>Inmotus RX needs an internet connection. Check your Wi-Fi or mobile data and try again.</p>
      <button id="retry" type="button">Try again</button>
    </main>
    <script>
      function retry() {
        var url = window.INMOTUS_SERVER_URL;
        if (url) window.location.replace(url);
        else window.location.reload();
      }
      document.getElementById("retry").addEventListener("click", retry);
      // Come back on our own as soon as the device reports connectivity.
      window.addEventListener("online", retry);
      // The server may be down rather than the device offline; retry gently.
      setInterval(function () { if (navigator.onLine) retry(); }, 10000);
    </script>
  </body>
</html>
```

```gitignore
# mobile/.gitignore
node_modules/
# generated by scripts/write-www-config.cjs on every sync
www/server-url.js
```

- [ ] **Step 6: Exclude `mobile/` from the web toolchain**

In `tsconfig.json` change `"exclude": ["node_modules"]` to `"exclude": ["node_modules", "mobile"]`.

In `eslint.config.mjs`, add `"mobile/**",` to the `globalIgnores([...])` array next to `"worktrees/**",`.

In `vitest.config.ts`, add `'mobile/**',` to the `exclude` array.

Create `.vercelignore` at the repo root:

```
# The native shell is built on developer machines, never on Vercel.
mobile/
```

- [ ] **Step 7: Generate the native projects and verify what was resolved**

Run, in order:

```bash
cd mobile
npx cap add ios
npx cap add android
npm run sync
npm run verify
npm test
cd ..
```

Expected: both `cap add` commands end with `[success] … platform added!` (no Xcode or Java is needed to generate); `npm run sync` prints `wrote www/server-url.js -> https://app.goinmotus.com` and no `[error]`; `npm run verify` prints `mobile verify OK`; `npm test` passes 7 tests.

Then prove the dev override resolves: `(cd mobile && CAP_SERVER_URL=http://192.168.1.20:3000 npm run sync >/dev/null && python3 -c "import json;print(json.load(open('android/app/src/main/assets/capacitor.config.json'))['server'])")` must print `'url': 'http://192.168.1.20:3000', 'cleartext': True`. Afterwards restore production with `(cd mobile && npm run sync)` and re-run `npm run verify` → `OK`.

- [ ] **Step 8: Confirm the web app is unaffected**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run && npx eslint mobile/capacitor.config.ts; echo "eslint exit (expect 'ignored' warning or 0): $?"`
Expected: tsc clean; Vitest totals unchanged from before this task; ESLint reports the file as ignored.

- [ ] **Step 9: Commit**

Run `git status --short` and confirm only `mobile/**`, `.vercelignore`, `tsconfig.json`, `eslint.config.mjs` and `vitest.config.ts` changed, and that `mobile/node_modules` and `mobile/www/server-url.js` are not listed. Then:

```bash
git add mobile .vercelignore tsconfig.json eslint.config.mjs vitest.config.ts
git commit -m "feat: scaffold the Capacitor mobile shell with iOS and Android projects"
```

---

### Task 2: Brand assets, permissions, iPhone-only, and version stamping

**Files:**
- Create: `mobile/scripts/make-placeholder-assets.cjs`, `mobile/resources/icon.png`, `mobile/resources/splash.png`, `mobile/resources/splash-dark.png`, `mobile/scripts/version.cjs`, `mobile/scripts/version.test.cjs`, `mobile/scripts/set-version.cjs`
- Modify: `mobile/ios/App/App/Info.plist`, `mobile/ios/App/App.xcodeproj/project.pbxproj`, `mobile/android/app/src/main/AndroidManifest.xml`, `mobile/android/app/build.gradle`, `mobile/scripts/verify.cjs` (fill in `checkInfoPlist`, `checkAndroidManifest`), `mobile/scripts/verify.test.cjs`, `mobile/package.json` (scripts)
- Generate: icon and splash files under `mobile/ios/**` and `mobile/android/**`

**Interfaces:**
- Consumes: `checkInfoPlist`, `checkAndroidManifest` stubs from Task 1.
- Produces: `versionCodeFor(semver: string): number`, `applyIosVersion(pbxproj: string, version: string): string`, `applyAndroidVersion(gradle: string, version: string): string` from `mobile/scripts/version.cjs`; scripts `assets`, `version:set` in `mobile/package.json`.

- [ ] **Step 1: Write failing tests for versioning and native checks**

Append to `mobile/scripts/verify.test.cjs`:

```js
const { checkInfoPlist, checkAndroidManifest } = require("./verify.cjs");

const PLIST_OK = `<dict>
<key>NSMicrophoneUsageDescription</key><string>x</string>
<key>NSCameraUsageDescription</key><string>x</string>
<key>NSPhotoLibraryUsageDescription</key><string>x</string>
<key>ITSAppUsesNonExemptEncryption</key><false/>
</dict>`;

test("Info.plist with every required key passes", () => {
  assert.deepEqual(checkInfoPlist(PLIST_OK), []);
});

test("Info.plist missing the microphone string is flagged", () => {
  const text = PLIST_OK.replace("<key>NSMicrophoneUsageDescription</key><string>x</string>", "");
  assert.ok(checkInfoPlist(text).some((p) => p.includes("NSMicrophoneUsageDescription")));
});

test("Info.plist must declare no non-exempt encryption", () => {
  const text = PLIST_OK.replace("<false/>", "<true/>");
  assert.ok(checkInfoPlist(text).some((p) => p.includes("ITSAppUsesNonExemptEncryption")));
});

const MANIFEST_OK = `<manifest>
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
</manifest>`;

test("AndroidManifest with the audio permissions passes", () => {
  assert.deepEqual(checkAndroidManifest(MANIFEST_OK), []);
});

test("AndroidManifest missing RECORD_AUDIO is flagged", () => {
  const text = MANIFEST_OK.replace('<uses-permission android:name="android.permission.RECORD_AUDIO" />', "");
  assert.ok(checkAndroidManifest(text).some((p) => p.includes("RECORD_AUDIO")));
});
```

Create `mobile/scripts/version.test.cjs`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { versionCodeFor, applyIosVersion, applyAndroidVersion } = require("./version.cjs");

test("versionCodeFor encodes major.minor.patch monotonically", () => {
  assert.equal(versionCodeFor("1.0.0"), 10000);
  assert.equal(versionCodeFor("1.2.3"), 10203);
  assert.equal(versionCodeFor("2.0.0"), 20000);
  assert.ok(versionCodeFor("1.10.0") > versionCodeFor("1.9.99"));
});

test("versionCodeFor rejects anything that is not x.y.z within range", () => {
  assert.throws(() => versionCodeFor("1.0"));
  assert.throws(() => versionCodeFor("1.100.0"));
  assert.throws(() => versionCodeFor("v1.0.0"));
});

const PBX = `
    MARKETING_VERSION = 1.0;
    CURRENT_PROJECT_VERSION = 1;
    MARKETING_VERSION = 1.0;
    CURRENT_PROJECT_VERSION = 1;`;

test("applyIosVersion rewrites every Debug and Release occurrence", () => {
  const out = applyIosVersion(PBX, "1.2.3");
  assert.equal((out.match(/MARKETING_VERSION = 1\.2\.3;/g) || []).length, 2);
  assert.equal((out.match(/CURRENT_PROJECT_VERSION = 10203;/g) || []).length, 2);
});

const GRADLE = `        versionCode 1
        versionName "1.0"`;

test("applyAndroidVersion rewrites versionCode and versionName", () => {
  const out = applyAndroidVersion(GRADLE, "1.2.3");
  assert.match(out, /versionCode 10203/);
  assert.match(out, /versionName "1\.2\.3"/);
});

test("apply functions throw if the expected fields are missing", () => {
  assert.throws(() => applyIosVersion("nothing here", "1.0.0"));
  assert.throws(() => applyAndroidVersion("nothing here", "1.0.0"));
});
```

Run: `node --test mobile/scripts/`
Expected: FAIL — `Cannot find module './version.cjs'`, and the new plist/manifest tests fail against the empty stubs.

- [ ] **Step 2: Implement versioning and the native checks**

```js
// mobile/scripts/version.cjs
/**
 * One app version, stamped everywhere. versionCode / CURRENT_PROJECT_VERSION
 * must strictly increase per store upload; major*10000 + minor*100 + patch
 * does that as long as minor and patch stay below 100.
 */
function versionCodeFor(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) throw new Error(`version "${version}" is not x.y.z`);
  const [major, minor, patch] = m.slice(1).map(Number);
  if (minor > 99 || patch > 99) throw new Error(`minor and patch must be < 100 in "${version}"`);
  return major * 10000 + minor * 100 + patch;
}

function replaceAllRequired(text, regex, replacement, label) {
  if (!regex.test(text)) throw new Error(`${label} not found`);
  return text.replace(new RegExp(regex.source, "g"), replacement);
}

function applyIosVersion(pbxproj, version) {
  const code = versionCodeFor(version);
  let out = replaceAllRequired(pbxproj, /MARKETING_VERSION = [^;]+;/, `MARKETING_VERSION = ${version};`, "MARKETING_VERSION");
  out = replaceAllRequired(out, /CURRENT_PROJECT_VERSION = [^;]+;/, `CURRENT_PROJECT_VERSION = ${code};`, "CURRENT_PROJECT_VERSION");
  return out;
}

function applyAndroidVersion(gradle, version) {
  const code = versionCodeFor(version);
  let out = replaceAllRequired(gradle, /versionCode \d+/, `versionCode ${code}`, "versionCode");
  out = replaceAllRequired(out, /versionName "[^"]*"/, `versionName "${version}"`, "versionName");
  return out;
}

module.exports = { versionCodeFor, applyIosVersion, applyAndroidVersion };
```

```js
// mobile/scripts/set-version.cjs
/** Stamps mobile/package.json "version" into the Xcode and Gradle projects. */
const fs = require("node:fs");
const path = require("node:path");
const { applyIosVersion, applyAndroidVersion, versionCodeFor } = require("./version.cjs");

const root = path.join(__dirname, "..");
const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const pbx = path.join(root, "ios/App/App.xcodeproj/project.pbxproj");
const gradle = path.join(root, "android/app/build.gradle");

fs.writeFileSync(pbx, applyIosVersion(fs.readFileSync(pbx, "utf8"), version));
fs.writeFileSync(gradle, applyAndroidVersion(fs.readFileSync(gradle, "utf8"), version));
console.log(`stamped ${version} (build ${versionCodeFor(version)}) into iOS and Android`);
```

Replace the two stubs in `mobile/scripts/verify.cjs`:

```js
const PLIST_REQUIRED_STRINGS = [
  "NSMicrophoneUsageDescription",
  "NSCameraUsageDescription",
  "NSPhotoLibraryUsageDescription",
];

function checkInfoPlist(text) {
  const problems = [];
  for (const key of PLIST_REQUIRED_STRINGS) {
    const re = new RegExp(`<key>${key}</key>\\s*<string>[^<]+</string>`);
    if (!re.test(text)) problems.push(`Info.plist: ${key} missing or empty`);
  }
  if (!/<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/.test(text)) {
    problems.push("Info.plist: ITSAppUsesNonExemptEncryption must be <false/>");
  }
  return problems;
}

const ANDROID_REQUIRED_PERMISSIONS = ["INTERNET", "RECORD_AUDIO", "MODIFY_AUDIO_SETTINGS"];

function checkAndroidManifest(text) {
  return ANDROID_REQUIRED_PERMISSIONS
    .filter((p) => !text.includes(`android:name="android.permission.${p}"`))
    .map((p) => `AndroidManifest: permission ${p} missing`);
}
```

Run: `node --test mobile/scripts/`
Expected: PASS, 17 tests.

- [ ] **Step 3: Add the permission strings and export flag to Info.plist**

Inside the top-level `<dict>` of `mobile/ios/App/App/Info.plist`, add:

```xml
	<key>NSMicrophoneUsageDescription</key>
	<string>Inmotus RX uses the microphone to record voice notes for your trainer or client.</string>
	<key>NSCameraUsageDescription</key>
	<string>Inmotus RX uses the camera so you can take progress and meal photos.</string>
	<key>NSPhotoLibraryUsageDescription</key>
	<string>Inmotus RX lets you choose existing photos for progress and meal logs.</string>
	<key>ITSAppUsesNonExemptEncryption</key>
	<false/>
```

Validate the file still parses: `plutil -lint mobile/ios/App/App/Info.plist` → `OK`.

- [ ] **Step 4: Make the iOS target iPhone-only**

In `mobile/ios/App/App.xcodeproj/project.pbxproj`, change every `TARGETED_DEVICE_FAMILY = "1,2";` to `TARGETED_DEVICE_FAMILY = 1;` (Debug and Release). Confirm: `grep -c 'TARGETED_DEVICE_FAMILY = 1;' mobile/ios/App/App.xcodeproj/project.pbxproj` prints `2` and `grep -c '"1,2"' …` prints `0`.

- [ ] **Step 5: Add the Android audio permissions**

In `mobile/android/app/src/main/AndroidManifest.xml`, after the existing `INTERNET` permission, add:

```xml
    <!-- Voice memos record through the web view's MediaRecorder. -->
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
```

Do NOT add `CAMERA`: photo inputs use the system camera/picker intent, which works without it, and declaring it would force a runtime prompt for that intent.

- [ ] **Step 6: Generate placeholder brand assets and the icon/splash sets**

```js
// mobile/scripts/make-placeholder-assets.cjs
/**
 * Placeholder icon and splash so the apps build and look intentional before
 * final brand art exists. Replace resources/*.png with real artwork (same
 * names and sizes) and re-run `npm run assets`.
 */
const path = require("node:path");
const sharp = require("sharp");

const BRAND = "#3F46C8";
const out = (f) => path.join(__dirname, "..", "resources", f);

function mark(size, fontSize, bg, fg) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<rect width="${size}" height="${size}" fill="${bg}"/>` +
      `<text x="50%" y="50%" dy="0.35em" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" ` +
      `font-weight="800" font-size="${fontSize}" fill="${fg}">RX</text></svg>`
  );
}

(async () => {
  await sharp(mark(1024, 380, BRAND, "#ffffff")).png().toFile(out("icon.png"));
  await sharp(mark(2732, 520, BRAND, "#ffffff")).png().toFile(out("splash.png"));
  await sharp(mark(2732, 520, "#151a2e", "#ffffff")).png().toFile(out("splash-dark.png"));
  console.log("placeholder assets written to mobile/resources/");
})();
```

Add scripts to `mobile/package.json`:

```json
"assets:placeholder": "node scripts/make-placeholder-assets.cjs",
"assets": "capacitor-assets generate --iconBackgroundColor '#3F46C8' --iconBackgroundColorDark '#151a2e' --splashBackgroundColor '#3F46C8' --splashBackgroundColorDark '#151a2e'",
"version:set": "node scripts/set-version.cjs"
```

Run: `(cd mobile && npm run assets:placeholder && npm run assets)`
Expected: three PNGs in `mobile/resources/`; `capacitor-assets` totals report android and ios files generated (probe run: 87 android, 10 ios).

- [ ] **Step 7: Stamp the version and re-verify**

Run: `(cd mobile && npm run version:set && npm run sync && npm run verify && npm test)`
Expected: `stamped 1.0.0 (build 10000) into iOS and Android`; `mobile verify OK`; 17 tests pass. Confirm: `grep -c 'MARKETING_VERSION = 1.0.0;' mobile/ios/App/App.xcodeproj/project.pbxproj` → `2`; `grep -n 'versionCode 10000' mobile/android/app/build.gradle` → one line.

- [ ] **Step 8: Commit**

```bash
git add mobile
git commit -m "feat: add app icons, splash, permissions and version stamping to the native shell"
```

---

### Task 3: Native lifecycle in the web app

**Files:**
- Create: `lib/native/lifecycle.ts`, `lib/native/__tests__/lifecycle.test.ts`, `components/layout/offline-banner.tsx`, `components/layout/__tests__/offline-banner.test.tsx`
- Modify: `components/providers/native-provider.tsx`, `app/layout.tsx`, `app/globals.css` (the `:root` block under "Mobile shell"), `package.json`, `package-lock.json`

**Interfaces:**
- Consumes: `resolveNativeInfo`, `NativeInfo` (`lib/native/platform.ts`); `useNative()` (`components/providers/native-provider.tsx`).
- Produces:
  ```ts
  export const RESUME_REFRESH_AFTER_MS: number;
  export function shouldRefreshOnResume(hiddenAt: number | null, now: number, thresholdMs?: number): boolean;
  export type BackAction = "back" | "minimize";
  export function decideBackAction(canGoBack: boolean): BackAction;
  export function shouldOpenExternally(href: string, currentOrigin: string): boolean;
  export interface LifecycleDeps { … }   // see Step 3
  export async function registerNativeLifecycle(deps: LifecycleDeps): Promise<() => void>;
  export function OfflineBanner(): JSX.Element | null;
  ```
  `NativeContextValue.appVersion` becomes populated on real native — Plan 4's version gate reads it.

- [ ] **Step 1: Install the plugin JS packages at the repo root**

The hosted web app imports these; `mobile/` holds the native halves. Versions must match `mobile/package.json`.

Run: `npm install --no-audit --no-fund @capacitor/app@8.1.1 @capacitor/browser@8.0.4 @capacitor/network@8.0.1 @capacitor/splash-screen@8.0.2 @capacitor/status-bar@8.0.3`
Expected: root `package.json` gains the five dependencies.

- [ ] **Step 2: Write the failing lifecycle tests**

```ts
// lib/native/__tests__/lifecycle.test.ts
import { describe, it, expect, vi } from "vitest";
import {
  RESUME_REFRESH_AFTER_MS,
  decideBackAction,
  registerNativeLifecycle,
  shouldOpenExternally,
  shouldRefreshOnResume,
  type LifecycleDeps,
} from "../lifecycle";

describe("shouldRefreshOnResume", () => {
  const t0 = 1_000_000;
  it("refreshes after the threshold", () => {
    expect(shouldRefreshOnResume(t0, t0 + RESUME_REFRESH_AFTER_MS + 1)).toBe(true);
  });
  it("refreshes exactly at the threshold", () => {
    expect(shouldRefreshOnResume(t0, t0 + RESUME_REFRESH_AFTER_MS)).toBe(true);
  });
  it("does not refresh after a short pause, so half-typed input survives", () => {
    expect(shouldRefreshOnResume(t0, t0 + 30_000)).toBe(false);
  });
  it("does not refresh when no pause was recorded", () => {
    expect(shouldRefreshOnResume(null, t0)).toBe(false);
  });
});

describe("decideBackAction", () => {
  it("goes back when there is history", () => expect(decideBackAction(true)).toBe("back"));
  it("minimises at the root instead of exiting to a blank view", () => expect(decideBackAction(false)).toBe("minimize"));
});

describe("shouldOpenExternally", () => {
  const origin = "https://app.goinmotus.com";
  it("keeps same-origin absolute and relative links in the app", () => {
    expect(shouldOpenExternally("https://app.goinmotus.com/clients/1", origin)).toBe(false);
    expect(shouldOpenExternally("/programs", origin)).toBe(false);
    expect(shouldOpenExternally("?tab=2", origin)).toBe(false);
  });
  it("opens other origins in the system browser", () => {
    expect(shouldOpenExternally("https://www.youtube.com/watch?v=x", origin)).toBe(true);
    expect(shouldOpenExternally("https://checkout.stripe.com/pay/1", origin)).toBe(true);
  });
  it("treats a look-alike host as external", () => {
    expect(shouldOpenExternally("https://app.goinmotus.com.evil.io/", origin)).toBe(true);
  });
  it("leaves mailto, tel and unparseable hrefs to the platform", () => {
    expect(shouldOpenExternally("mailto:support@goinmotus.com", origin)).toBe(false);
    expect(shouldOpenExternally("tel:+15551234", origin)).toBe(false);
    expect(shouldOpenExternally("http://[bad", origin)).toBe(false);
  });
});

function makeDeps() {
  const handlers: Record<string, (arg: never) => void> = {};
  const removed: string[] = [];
  const listen = (name: string) => (event: string, fn: (arg: never) => void) => {
    handlers[`${name}:${event}`] = fn;
    return Promise.resolve({ remove: () => { removed.push(`${name}:${event}`); return Promise.resolve(); } });
  };
  let clickHandler: ((e: unknown) => void) | undefined;
  const deps: LifecycleDeps = {
    app: {
      addListener: listen("app") as LifecycleDeps["app"]["addListener"],
      minimizeApp: vi.fn(() => Promise.resolve()),
      getInfo: vi.fn(() => Promise.resolve({ version: "1.2.3" })),
    },
    network: {
      addListener: listen("network") as LifecycleDeps["network"]["addListener"],
      getStatus: vi.fn(() => Promise.resolve({ connected: false })),
    },
    splash: { hide: vi.fn(() => Promise.resolve()) },
    statusBar: { setStyle: vi.fn(() => Promise.resolve()) },
    browser: { open: vi.fn(() => Promise.resolve()) },
    doc: {
      addEventListener: (_t: string, fn: (e: unknown) => void) => { clickHandler = fn; },
      removeEventListener: vi.fn(),
    },
    origin: "https://app.goinmotus.com",
    now: vi.fn(() => 0),
    historyBack: vi.fn(),
    onOnlineChange: vi.fn(),
    onAppVersion: vi.fn(),
    onResumeAfterLongPause: vi.fn(),
  };
  return { deps, handlers, removed, click: (e: unknown) => clickHandler?.(e) };
}

describe("registerNativeLifecycle", () => {
  it("hides the splash, sets the status bar, reports version and connectivity", async () => {
    const { deps } = makeDeps();
    await registerNativeLifecycle(deps);
    expect(deps.splash.hide).toHaveBeenCalled();
    expect(deps.statusBar.setStyle).toHaveBeenCalledWith({ style: "LIGHT" });
    expect(deps.onAppVersion).toHaveBeenCalledWith("1.2.3");
    expect(deps.onOnlineChange).toHaveBeenCalledWith(false);
  });

  it("routes the Android back button", async () => {
    const { deps, handlers } = makeDeps();
    await registerNativeLifecycle(deps);
    handlers["app:backButton"]({ canGoBack: true } as never);
    expect(deps.historyBack).toHaveBeenCalled();
    handlers["app:backButton"]({ canGoBack: false } as never);
    expect(deps.app.minimizeApp).toHaveBeenCalled();
  });

  it("refreshes only after a long background", async () => {
    const { deps, handlers } = makeDeps();
    await registerNativeLifecycle(deps);
    vi.mocked(deps.now).mockReturnValue(0);
    handlers["app:appStateChange"]({ isActive: false } as never);
    vi.mocked(deps.now).mockReturnValue(10_000);
    handlers["app:appStateChange"]({ isActive: true } as never);
    expect(deps.onResumeAfterLongPause).not.toHaveBeenCalled();
    handlers["app:appStateChange"]({ isActive: false } as never);
    vi.mocked(deps.now).mockReturnValue(10_000 + RESUME_REFRESH_AFTER_MS);
    handlers["app:appStateChange"]({ isActive: true } as never);
    expect(deps.onResumeAfterLongPause).toHaveBeenCalledTimes(1);
  });

  it("forwards connectivity changes", async () => {
    const { deps, handlers } = makeDeps();
    await registerNativeLifecycle(deps);
    handlers["network:networkStatusChange"]({ connected: true } as never);
    expect(deps.onOnlineChange).toHaveBeenLastCalledWith(true);
  });

  it("opens external links in the system browser and leaves internal ones alone", async () => {
    const { deps, click } = makeDeps();
    await registerNativeLifecycle(deps);
    const external = { preventDefault: vi.fn(), defaultPrevented: false, target: { closest: () => ({ getAttribute: () => "https://youtube.com/x" }) } };
    click(external);
    expect(external.preventDefault).toHaveBeenCalled();
    expect(deps.browser.open).toHaveBeenCalledWith({ url: "https://youtube.com/x" });
    const internal = { preventDefault: vi.fn(), defaultPrevented: false, target: { closest: () => ({ getAttribute: () => "/clients" }) } };
    click(internal);
    expect(internal.preventDefault).not.toHaveBeenCalled();
  });

  it("removes every listener on cleanup", async () => {
    const { deps, removed } = makeDeps();
    const cleanup = await registerNativeLifecycle(deps);
    cleanup();
    await Promise.resolve();
    expect(removed.sort()).toEqual(["app:appStateChange", "app:backButton", "network:networkStatusChange"]);
    expect(deps.doc.removeEventListener).toHaveBeenCalled();
  });

  it("keeps working when a plugin call rejects", async () => {
    const { deps } = makeDeps();
    vi.mocked(deps.splash.hide).mockRejectedValue(new Error("no splash"));
    vi.mocked(deps.app.getInfo).mockRejectedValue(new Error("no info"));
    await expect(registerNativeLifecycle(deps)).resolves.toBeTypeOf("function");
  });
});
```

Run: `npx vitest run lib/native/__tests__/lifecycle.test.ts`
Expected: FAIL — cannot resolve `../lifecycle`.

- [ ] **Step 3: Implement the lifecycle module**

```ts
// lib/native/lifecycle.ts
/**
 * Native shell lifecycle (spec §5, §9). Pure decisions plus one registration
 * function whose Capacitor plugins are injected, so it is testable without a
 * device. NativeProvider passes the real plugins; tests pass fakes.
 */

export const RESUME_REFRESH_AFTER_MS = 5 * 60 * 1000;

export function shouldRefreshOnResume(
  hiddenAt: number | null,
  now: number,
  thresholdMs: number = RESUME_REFRESH_AFTER_MS
): boolean {
  return hiddenAt !== null && now - hiddenAt >= thresholdMs;
}

export type BackAction = "back" | "minimize";

export function decideBackAction(canGoBack: boolean): BackAction {
  return canGoBack ? "back" : "minimize";
}

/** True only for http(s) links to a different origin. */
export function shouldOpenExternally(href: string, currentOrigin: string): boolean {
  let url: URL;
  try {
    url = new URL(href, currentOrigin);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  return url.origin !== new URL(currentOrigin).origin;
}

interface ListenerHandle {
  remove(): Promise<void>;
}

export interface LifecycleDeps {
  app: {
    addListener(event: "backButton", fn: (e: { canGoBack: boolean }) => void): Promise<ListenerHandle>;
    addListener(event: "appStateChange", fn: (e: { isActive: boolean }) => void): Promise<ListenerHandle>;
    minimizeApp(): Promise<void>;
    getInfo(): Promise<{ version: string }>;
  };
  network: {
    addListener(event: "networkStatusChange", fn: (e: { connected: boolean }) => void): Promise<ListenerHandle>;
    getStatus(): Promise<{ connected: boolean }>;
  };
  splash: { hide(): Promise<void> };
  statusBar: { setStyle(options: { style: "LIGHT" }): Promise<void> };
  browser: { open(options: { url: string }): Promise<void> };
  doc: {
    addEventListener(type: "click", fn: (e: never) => void, capture: boolean): void;
    removeEventListener(type: "click", fn: (e: never) => void, capture: boolean): void;
  };
  origin: string;
  now(): number;
  historyBack(): void;
  onOnlineChange(online: boolean): void;
  onAppVersion(version: string): void;
  onResumeAfterLongPause(): void;
}

interface ClickLike {
  defaultPrevented: boolean;
  preventDefault(): void;
  target: { closest?(selector: string): { getAttribute(name: string): string | null } | null } | null;
}

const ignore = () => undefined;

export async function registerNativeLifecycle(deps: LifecycleDeps): Promise<() => void> {
  // Hand-off from the native splash as soon as the web app is interactive.
  deps.splash.hide().catch(ignore);
  deps.statusBar.setStyle({ style: "LIGHT" }).catch(ignore);
  deps.app.getInfo().then((info) => deps.onAppVersion(info.version)).catch(ignore);
  deps.network.getStatus().then((s) => deps.onOnlineChange(s.connected)).catch(ignore);

  let hiddenAt: number | null = null;
  const handles = await Promise.all([
    deps.app.addListener("backButton", ({ canGoBack }) => {
      if (decideBackAction(canGoBack) === "back") deps.historyBack();
      else deps.app.minimizeApp().catch(ignore);
    }),
    deps.app.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) {
        hiddenAt = deps.now();
        return;
      }
      if (shouldRefreshOnResume(hiddenAt, deps.now())) deps.onResumeAfterLongPause();
      hiddenAt = null;
    }),
    deps.network.addListener("networkStatusChange", ({ connected }) => deps.onOnlineChange(connected)),
  ]);

  const onClick = (e: ClickLike) => {
    if (e.defaultPrevented) return;
    const anchor = e.target?.closest?.("a[href]");
    const href = anchor?.getAttribute("href");
    if (!href || !shouldOpenExternally(href, deps.origin)) return;
    e.preventDefault();
    deps.browser.open({ url: new URL(href, deps.origin).toString() }).catch(ignore);
  };
  deps.doc.addEventListener("click", onClick as (e: never) => void, true);

  return () => {
    for (const h of handles) h.remove().catch(ignore);
    deps.doc.removeEventListener("click", onClick as (e: never) => void, true);
  };
}
```

Run: `npx vitest run lib/native/__tests__/lifecycle.test.ts`
Expected: PASS, 17 tests. If the external-link test fails because `new URL(href, origin).toString()` normalises `https://youtube.com/x` differently, assert against the normalised string rather than changing the implementation, and say so in the report.

- [ ] **Step 4: Wire the lifecycle into `NativeProvider`**

In `components/providers/native-provider.tsx`:

1. Add `import { useRouter } from "next/navigation";` and `import { registerNativeLifecycle } from "@/lib/native/lifecycle";`.
2. Inside `NativeProvider`, add `const router = useRouter();`.
3. Update the `NativeContextValue` doc comment on `isOnline` to: `/** Connectivity: @capacitor/network inside the native shell, browser online/offline events elsewhere. */`
4. Add this effect after the existing two:

```tsx
  useEffect(() => {
    // Only the real shell: the ?native= dev override fakes detection in a
    // desktop browser, where calling native plugins would be meaningless.
    if (!Capacitor.isNativePlatform()) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const [{ App }, { Network }, { SplashScreen }, { StatusBar, Style }, { Browser }] = await Promise.all([
        import("@capacitor/app"),
        import("@capacitor/network"),
        import("@capacitor/splash-screen"),
        import("@capacitor/status-bar"),
        import("@capacitor/browser"),
      ]);
      const dispose = await registerNativeLifecycle({
        app: App,
        network: Network,
        splash: SplashScreen,
        statusBar: { setStyle: () => StatusBar.setStyle({ style: Style.Light }) },
        browser: Browser,
        doc: document,
        origin: window.location.origin,
        now: () => Date.now(),
        historyBack: () => window.history.back(),
        onOnlineChange: setIsOnline,
        onAppVersion: (appVersion) => setInfo((prev) => ({ ...prev, appVersion })),
        onResumeAfterLongPause: () => router.refresh(),
      });
      if (cancelled) dispose();
      else cleanup = dispose;
    })();
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [router]);
```

If TypeScript rejects passing `App`, `Network`, `SplashScreen`, `Browser` or `document` to the structural `LifecycleDeps` types, adapt with thin wrapper objects (as done for `statusBar`) rather than loosening `LifecycleDeps` to `any`. Report what you adapted.

- [ ] **Step 5: Write the offline banner, its test, and mount it**

```tsx
// components/layout/__tests__/offline-banner.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OfflineBanner } from "../offline-banner";

describe("OfflineBanner", () => {
  it("renders nothing while online, which is the default context", () => {
    expect(renderToStaticMarkup(<OfflineBanner />)).toBe("");
  });
});
```

```tsx
// components/layout/offline-banner.tsx
"use client";

import { WifiOff } from "lucide-react";
import { useNative } from "@/hooks/use-native";

/** Thin in-session banner (spec §9). Cold-start offline is handled by the shell's offline page. */
export function OfflineBanner() {
  const { isOnline } = useNative();
  if (isOnline) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 border-b border-warning-border bg-warning-soft px-4 pb-1.5 text-xs font-medium text-warning-foreground"
      style={{ paddingTop: "calc(var(--safe-top) + 0.375rem)" }}
    >
      <WifiOff className="size-3.5" aria-hidden />
      No internet connection
    </div>
  );
}
```

In `app/layout.tsx`, import `OfflineBanner` from `@/components/layout/offline-banner` and render `<OfflineBanner />` inside `<NativeProvider>` immediately before `<TooltipProvider>`.

Run: `npx vitest run components/layout/__tests__/offline-banner.test.tsx`
Expected: PASS, 1 test.

- [ ] **Step 6: Prefer Capacitor's injected safe-area values**

In `app/globals.css`, in the `:root` block under the "Mobile shell" comment, replace the two safe-area lines with:

```css
  /* Android (Capacitor SystemBars "css") injects --safe-area-inset-*; iOS and
     modern Chromium provide env(). Prefer the injected value when present. */
  --safe-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px));
  --safe-bottom: var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px));
```

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run && npx eslint lib/native components/providers components/layout/offline-banner.tsx app/layout.tsx`
Expected: tsc clean; full suite passes apart from any known timezone-dependent failures in `components/dashboard/__tests__/client-dashboard-render.test.tsx`; ESLint clean on the listed files.

Run: `npm run build`
Expected: success.

- [ ] **Step 8: Commit**

```bash
git add lib/native components/providers components/layout/offline-banner.tsx components/layout/__tests__/offline-banner.test.tsx app/layout.tsx app/globals.css package.json package-lock.json
git commit -m "feat: wire splash, back button, resume refresh, connectivity and external links into the native shell"
```

---

### Task 4: Developer workflow and runbook

**Files:**
- Create: `mobile/README.md`
- Modify: `mobile/package.json` (scripts), `package.json` (root `dev:lan` script)

**Interfaces:**
- Consumes: every script from Tasks 1–2.
- Produces: the documented commands the owner uses.

- [ ] **Step 1: Finalise scripts**

`mobile/package.json` `scripts` must end up as:

```json
"sync": "node scripts/write-www-config.cjs && cap sync",
"verify": "node scripts/verify.cjs",
"test": "node --test scripts/",
"open:ios": "cap open ios",
"open:android": "cap open android",
"run:ios": "cap run ios",
"run:android": "cap run android",
"assets:placeholder": "node scripts/make-placeholder-assets.cjs",
"assets": "capacitor-assets generate --iconBackgroundColor '#3F46C8' --iconBackgroundColorDark '#151a2e' --splashBackgroundColor '#3F46C8' --splashBackgroundColorDark '#151a2e'",
"version:set": "node scripts/set-version.cjs"
```

In the root `package.json`, add `"dev:lan": "next dev -H 0.0.0.0",` after `"dev"`.

- [ ] **Step 2: Write `mobile/README.md`**

It must contain these sections, each with exact commands:

1. **What this is** — two sentences: the apps are a native shell that loads the hosted web app; web changes ship with a Vercel deploy, native changes need a store build.
2. **One-time setup (owner's Mac)** — install Xcode from the App Store and run `sudo xcode-select -s /Applications/Xcode.app` and `xcodebuild -runFirstLaunch`; install Android Studio, open SDK Manager and install the latest SDK Platform and Build-Tools; add to shell profile `export ANDROID_HOME="$HOME/Library/Android/sdk"` and `export PATH="$ANDROID_HOME/platform-tools:$PATH"`; Android Studio bundles its own JDK, so no separate Java install is needed for builds from Studio; `cd mobile && npm install`. Note that iOS uses Swift Package Manager, so no CocoaPods is required.
3. **Run on your own phone** — iPhone: `npm run sync && npm run open:ios`, pick your team under Signing & Capabilities (a free Apple ID works for your own device), plug the phone in, press Run. Android: enable Developer options and USB debugging, `npm run sync && npm run open:android`, press Run.
4. **Point the app at your laptop (live reload)** — `npm run dev:lan` at the repo root; find the LAN IP (`ipconfig getifaddr en0`); `cd mobile && CAP_SERVER_URL=http://<ip>:3000 npm run sync`; run the app; afterwards `npm run sync` with no variable to restore production before any release build. Warn that a dev build pointed at a laptop must never be uploaded to a store, and that `npm run verify` flags cleartext on an https URL.
5. **Preview builds** — same with `CAP_SERVER_URL=https://<vercel-preview-url>`.
6. **Versioning** — bump `version` in `mobile/package.json` (x.y.z, minor and patch below 100), run `npm run version:set`, commit; explain build number = major×10000 + minor×100 + patch.
7. **Icons and splash** — current art is a placeholder; replace `resources/icon.png` (1024×1024, no transparency), `resources/splash.png` and `resources/splash-dark.png` (2732×2732, logo centred within the middle ~1200px), then `npm run assets`.
8. **Release builds** — iOS: Product → Archive in Xcode → Distribute App → App Store Connect → TestFlight. Android: Build → Generate Signed Bundle → Android App Bundle, create and back up the upload keystore (never commit it), upload the `.aab` to Play Console internal testing.
9. **Before every store build checklist** — `npm run sync` with no `CAP_SERVER_URL`; `npm run verify` prints OK; `npm test` passes; version bumped and stamped.
10. **Troubleshooting** — `Parsing capacitor.config.ts failed … Cannot use import statement outside a module` means TypeScript 7 got installed in `mobile/`; keep `typescript@^5`. Sign-in opens Safari/Chrome instead of staying in the app: add the Clerk domain to `server.allowNavigation` and re-sync. Blank screen on launch: check `server.url` in the resolved config with `npm run verify`.
11. **Secrets that must never be committed** — Android upload keystore and passwords; later, `GoogleService-Info.plist` and `google-services.json` (Plan 3).

- [ ] **Step 3: Verify every documented command that can run here**

Run: `(cd mobile && npm run sync && npm run verify && npm test && npm run version:set)` and `node -e "const p=require('./package.json');if(!p.scripts['dev:lan'])process.exit(1)"`.
Expected: all succeed; `git diff mobile/ios mobile/android` shows no changes from `version:set` (already stamped).

Confirm each command named in the README exists as a script: `node -e "const s=require('./mobile/package.json').scripts;for(const k of ['sync','verify','test','open:ios','open:android','run:ios','run:android','assets','assets:placeholder','version:set'])if(!s[k]){console.error('missing',k);process.exit(1)}"`.

- [ ] **Step 4: Commit**

```bash
git add mobile/README.md mobile/package.json package.json
git commit -m "docs: add the mobile build, run and release runbook"
```

---

### Task 5: Full verification

**Files:** none.

- [ ] **Step 1:** `(cd mobile && npm run sync && npm run verify && npm test)` → `mobile verify OK`, 17 tests pass.
- [ ] **Step 2:** `npx tsc --noEmit -p tsconfig.json` → clean. `npx vitest run` → only known timezone-dependent failures, if any. `npm run build` → success.
- [ ] **Step 3:** Lint every web file this plan touched, one at a time, quoting paths: `git diff --name-only <plan-base> HEAD | grep -E '\.(ts|tsx)$' | grep -v '^mobile/'`. All clean.
- [ ] **Step 4:** Signed-out smoke in a headless browser against `npm run dev`: `/?native=ios` sets `data-native` and `data-platform="ios"` and no console error mentions `@capacitor`; toggling DevTools offline shows the "No internet connection" banner and it disappears when back online. Say plainly which checks were observed.
- [ ] **Step 5:** `git status --short` shows no stray files; `mobile/node_modules` and `mobile/www/server-url.js` untracked and ignored.
- [ ] **Step 6:** Report: what was verified here, and what only the owner can verify — compiling, launching on a device, splash timing, back button feel, status bar appearance, voice memo microphone prompt, and the offline page on a real device.

---

## Self-review

- **Spec §3 repository layout:** Task 1 (package, config, www, gitignore, exclusions), Task 2 (resources, version script), Task 4 (README). `google-services.json` / `GoogleService-Info.plist` are Plan 3. ✔
- **Spec §5 launch and lifecycle:** splash hand-off, resume refresh, Android back, external links — Task 3. Haptics and the download bridge are Plan 4 per the roadmap. ✔
- **Spec §5 media permissions:** microphone, camera, photo library strings; Android audio permissions — Task 2. ✔
- **Spec §9 offline:** bundled page with Retry and auto-retry — Task 1; in-session banner — Task 3. ✔
- **Spec §11 environments and versioning:** `CAP_SERVER_URL`, cleartext only for http, single version source — Tasks 1, 2, 4. CI deliberately absent (spec: none in v1). ✔
- **Review Focus:** all five pinned to tests in Tasks 1 and 3. ✔
- **Type consistency:** `resolveServerUrl`, `checkResolvedConfig`, `checkInfoPlist`, `checkAndroidManifest`, `versionCodeFor`, `applyIosVersion`, `applyAndroidVersion`, `registerNativeLifecycle`, `LifecycleDeps`, `shouldOpenExternally`, `decideBackAction`, `shouldRefreshOnResume` used identically wherever referenced. ✔


---

## Execution record (2026-09-26)

Executed via subagent-driven development: commits c25963d..a368de1 on `mobile-app-capacitor`. Every task passed review, most after one fix round; a whole-plan review and one fix wave followed.

Rulings made during execution, in order:

1. T3 test fakes may use "as unknown as" casts where TS rejects a direct cast to overloaded listener types — test-only typing, behaviour unchanged — cost: none.
2. "full suite passes" in T3/T5 tolerates the known timezone-dependent client-dashboard-render failures if they appear — pre-existing and out of scope — cost: none.
3. the plan's "test": "node --test scripts/" is a PLAN DEFECT, confirmed by controller on Node v24.15.0 — the runner treats a directory arg as a module path (MODULE_NOT_FOUND), while node --test "scripts/*.test.cjs" runs all 7. Fix the script to the glob form in Task 1's fix loop; Tasks 2/4/5 call npm test so they inherit it — cost: none.
4. finding 3 is a tooling gap, not just docs — add verify:release that requires server.url === DEFAULT_SERVER_URL and no cleartext, and point the release checklist at it — cost: one extra script and 3 tests.
5. (Final whole-plan review) One fix dispatch covering: resume refresh gated on connectivity, because an offline resume evicted the user to the offline page and lost their input; `verify:release` asserts the stamped native versions equal `package.json`; splash `launchShowDuration` raised 3000 → 5000 to avoid a white blank on slow first loads; root `@capacitor/*` versions pinned exactly; README corrections (company team when the bundle ID is registered, removed an impossible cleartext warning, what verify prints, Safari/`chrome://inspect` debugging, Archive destination); two stale lint directives removed. Landscape left enabled (not a rejection risk). Same-origin `target="_blank"` handling deferred to Plan 4's download bridge. Cost: a small multi-file change.
6. (Residual after the fix wave, not fixed in Plan 2) Stale `refreshOwed`: if a second long-pause resume finds the device online, it refreshes directly without clearing `refreshOwed`, so a later connectivity event triggers one extra `router.refresh()`. Harmless, because an online refresh preserves client state in the App Router, so no second fix wave. Carried into Plan 4, which edits `lib/native/lifecycle.ts`: clear `refreshOwed` on the direct-refresh path and add a two-cycle test. Cost: one possible extra refresh until Plan 4 lands.
