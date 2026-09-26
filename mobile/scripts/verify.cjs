/**
 * Checks what `cap sync` actually resolved, not what the config file says.
 * Usage (after `npm run sync`): node scripts/verify.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_SERVER_URL } = require("../server-url.cjs");
const { versionCodeFor } = require("./version.cjs");

// Must stay in step with lib/native/platform.ts in the web app.
const UA_PATTERN = /InmotusApp\/(\d+\.\d+\.\d+)\s*\((ios|android)\)/i;
const REQUIRED_HOSTS = ["app.goinmotus.com", "*.goinmotus.com"];
// The only wildcard allowed in allowNavigation. Clerk's dev host is added as
// one exact host (decoded from the publishable key), never *.accounts.dev.
const ALLOWED_WILDCARD = "*.goinmotus.com";

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
  for (const host of nav) {
    if (String(host).includes("*") && host !== ALLOWED_WILDCARD) {
      problems.push(`${platform}: allowNavigation wildcard ${host} is not allowed (only ${ALLOWED_WILDCARD})`);
    }
  }
  for (const f of ["offline.html", "server-url.js"]) {
    if (!publicFiles.includes(f)) problems.push(`${platform}: bundled ${f} missing — run npm run sync`);
  }

  const plugins = config.plugins || {};
  const splash = plugins.SplashScreen || {};
  if (splash.launchAutoHide !== true) problems.push(`${platform}: plugins.SplashScreen.launchAutoHide must be true`);
  if (splash.launchShowDuration !== 5000) problems.push(`${platform}: plugins.SplashScreen.launchShowDuration must be 5000`);
  if (splash.launchFadeOutDuration !== 200) problems.push(`${platform}: plugins.SplashScreen.launchFadeOutDuration must be 200`);

  const statusBar = plugins.StatusBar || {};
  if (statusBar.style !== "LIGHT") problems.push(`${platform}: plugins.StatusBar.style must be LIGHT`);

  const systemBars = plugins.SystemBars || {};
  if (systemBars.insetsHandling !== "css") problems.push(`${platform}: plugins.SystemBars.insetsHandling must be css`);
  if (systemBars.initialViewportFitValueHint !== "cover") {
    problems.push(`${platform}: plugins.SystemBars.initialViewportFitValueHint must be cover`);
  }

  const pushNotifications = plugins.PushNotifications || {};
  if (!Array.isArray(pushNotifications.presentationOptions) || pushNotifications.presentationOptions.length !== 0) {
    problems.push(`${platform}: plugins.PushNotifications.presentationOptions must be an empty array`);
  }

  if (platform === "ios") {
    const ios = config.ios || {};
    if (ios.contentInset !== "never") problems.push(`${platform}: ios.contentInset must be never`);
  }

  return problems;
}

// Stricter than checkResolvedConfig: a laptop IP or a preview URL passes the
// normal checks (cleartext just has to match the scheme) but must never ship
// to a store. Run with --release right before an archive/signed bundle.
function checkReleaseConfig(config, platform) {
  const problems = [];
  const server = config.server || {};
  if (server.url !== DEFAULT_SERVER_URL) {
    problems.push(`${platform}: server.url is "${server.url}", must be ${DEFAULT_SERVER_URL} for a release build`);
  }
  if (server.cleartext) problems.push(`${platform}: server.cleartext must be false for a release build`);
  for (const host of server.allowNavigation || []) {
    if (/accounts\.dev$/i.test(String(host))) {
      problems.push(
        `${platform}: allowNavigation has ${host} — a release build must use a production Clerk instance on a goinmotus.com domain`
      );
    }
  }
  return problems;
}

// Catches the "bumped package.json but forgot npm run version:set" mistake:
// the UA suffix (from package.json, via capacitor.config.ts) would report one
// version while App.getInfo() (from the stamped native project files) reports
// another, and a store rejects a re-submitted build number besides.
function checkStampedVersions({ version, pbxproj, gradle }) {
  const problems = [];
  const code = versionCodeFor(version);

  const marketingMatches = [...pbxproj.matchAll(/MARKETING_VERSION = ([^;]+);/g)];
  if (marketingMatches.length === 0) problems.push("ios: MARKETING_VERSION not found in project.pbxproj");
  for (const m of marketingMatches) {
    if (m[1] !== version) problems.push(`ios: MARKETING_VERSION is ${m[1]}, must be ${version} (run npm run version:set)`);
  }

  const projectVersionMatches = [...pbxproj.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)];
  if (projectVersionMatches.length === 0) problems.push("ios: CURRENT_PROJECT_VERSION not found in project.pbxproj");
  for (const m of projectVersionMatches) {
    if (m[1] !== String(code)) {
      problems.push(`ios: CURRENT_PROJECT_VERSION is ${m[1]}, must be ${code} (run npm run version:set)`);
    }
  }

  const versionNameMatches = [...gradle.matchAll(/versionName "([^"]*)"/g)];
  if (versionNameMatches.length === 0) problems.push("android: versionName not found in build.gradle");
  for (const m of versionNameMatches) {
    if (m[1] !== version) problems.push(`android: versionName is ${m[1]}, must be ${version} (run npm run version:set)`);
  }

  const versionCodeMatches = [...gradle.matchAll(/versionCode (\d+)/g)];
  if (versionCodeMatches.length === 0) problems.push("android: versionCode not found in build.gradle");
  for (const m of versionCodeMatches) {
    if (Number(m[1]) !== code) {
      problems.push(`android: versionCode is ${m[1]}, must be ${code} (run npm run version:set)`);
    }
  }

  return problems;
}

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

// Universal links / app links / the inmotus:// scheme. `paths` comes from
// lib/native/deep-link-paths.json in the web app, the same list the AASA route
// serves, so the Android filter can't silently drift from it.
function checkDeepLinks({ entitlements, pbxproj, infoPlist, manifest, paths }) {
  const problems = [];
  if (!entitlements.includes("<string>applinks:app.goinmotus.com</string>")) {
    problems.push("ios: App.entitlements missing applinks:app.goinmotus.com");
  }
  const entitlementRefs = pbxproj.split("CODE_SIGN_ENTITLEMENTS = App/App.entitlements;").length - 1;
  if (entitlementRefs !== 1) {
    problems.push(
      `ios: CODE_SIGN_ENTITLEMENTS = App/App.entitlements; appears ${entitlementRefs} times in project.pbxproj, must be exactly once (App target Release only)`
    );
  }
  if (!/<key>CFBundleURLSchemes<\/key>\s*<array>[\s\S]*?<string>inmotus<\/string>[\s\S]*?<\/array>/.test(infoPlist)) {
    problems.push("Info.plist: CFBundleURLSchemes does not register inmotus");
  }
  if (!manifest.includes('android:autoVerify="true"')) problems.push('AndroidManifest: no android:autoVerify="true" intent filter');
  if (!manifest.includes('android:host="app.goinmotus.com"')) problems.push('AndroidManifest: android:host="app.goinmotus.com" missing');
  if (!manifest.includes('android:scheme="inmotus"')) problems.push('AndroidManifest: android:scheme="inmotus" missing');
  for (const p of paths) {
    if (!manifest.includes(`android:pathPrefix="${p}"`)) problems.push(`AndroidManifest: pathPrefix ${p} missing`);
  }
  // And the reverse: a stale manifest line would open links the AASA does not claim.
  for (const m of manifest.matchAll(/android:pathPrefix="([^"]*)"/g)) {
    if (!paths.includes(m[1])) problems.push(`AndroidManifest: pathPrefix ${m[1]} is not in lib/native/deep-link-paths.json`);
  }
  return problems;
}

// Native push wiring. AppDelegate must forward the APNs device-token
// callbacks to Capacitor, the entitlement must request production APNs, and
// the manifest must have the runtime permission plus the FCM default-icon /
// default-channel meta-data (without them, Android silently falls back to a
// generic bell and the "Miscellaneous" channel).
function checkPush({ appDelegate, entitlements, manifest }) {
  const problems = [];
  if (!appDelegate.includes("capacitorDidRegisterForRemoteNotifications")) {
    problems.push("ios: AppDelegate.swift missing didRegisterForRemoteNotificationsWithDeviceToken forwarding");
  }
  if (!appDelegate.includes("capacitorDidFailToRegisterForRemoteNotifications")) {
    problems.push("ios: AppDelegate.swift missing didFailToRegisterForRemoteNotificationsWithError forwarding");
  }
  if (!entitlements.includes("<key>aps-environment</key>")) {
    problems.push("ios: App.entitlements missing aps-environment");
  }
  if (!manifest.includes('android:name="android.permission.POST_NOTIFICATIONS"')) {
    problems.push("AndroidManifest: permission POST_NOTIFICATIONS missing");
  }
  if (!manifest.includes('android:name="com.google.firebase.messaging.default_notification_icon"')) {
    problems.push("AndroidManifest: com.google.firebase.messaging.default_notification_icon meta-data missing");
  }
  if (!manifest.includes('android:name="com.google.firebase.messaging.default_notification_channel_id"')) {
    problems.push("AndroidManifest: com.google.firebase.messaging.default_notification_channel_id meta-data missing");
  }
  return problems;
}

function readIfExists(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

function main() {
  const release = process.argv.includes("--release");
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
    const config = JSON.parse(raw);
    problems.push(...checkResolvedConfig(config, platform, files));
    if (release) problems.push(...checkReleaseConfig(config, platform));
    const serverUrlJs = readIfExists(path.join(pub, "server-url.js")) || "";
    const url = config.server && config.server.url;
    if (url && !serverUrlJs.includes(JSON.stringify(url))) {
      problems.push(`${platform}: bundled server-url.js does not point at ${url}`);
    }
  }
  const offline = readIfExists(path.join(root, "www/offline.html")) || "";
  if (!/id="retry"/.test(offline)) problems.push("www/offline.html has no Retry control (id=\"retry\")");
  if (!offline.includes("server-url.js")) problems.push("www/offline.html does not load server-url.js");

  problems.push(...checkInfoPlist(readIfExists(path.join(root, "ios/App/App/Info.plist")) || ""));
  problems.push(...checkAndroidManifest(readIfExists(path.join(root, "android/app/src/main/AndroidManifest.xml")) || ""));

  const pathsRaw = readIfExists(path.join(__dirname, "../../lib/native/deep-link-paths.json"));
  if (!pathsRaw) problems.push("lib/native/deep-link-paths.json not found");
  const entitlements = readIfExists(path.join(root, "ios/App/App/App.entitlements")) || "";
  const manifest = readIfExists(path.join(root, "android/app/src/main/AndroidManifest.xml")) || "";
  const appDelegate = readIfExists(path.join(root, "ios/App/App/AppDelegate.swift")) || "";
  problems.push(
    ...checkDeepLinks({
      entitlements,
      pbxproj: readIfExists(path.join(root, "ios/App/App.xcodeproj/project.pbxproj")) || "",
      infoPlist: readIfExists(path.join(root, "ios/App/App/Info.plist")) || "",
      manifest,
      paths: pathsRaw ? JSON.parse(pathsRaw) : [],
    })
  );
  problems.push(...checkPush({ appDelegate, entitlements, manifest }));

  if (release) {
    const pkgRaw = readIfExists(path.join(root, "package.json"));
    const pbxprojRaw = readIfExists(path.join(root, "ios/App/App.xcodeproj/project.pbxproj"));
    const gradleRaw = readIfExists(path.join(root, "android/app/build.gradle"));
    if (!pkgRaw) problems.push("package.json not found");
    if (!pbxprojRaw) problems.push("ios: ios/App/App.xcodeproj/project.pbxproj not found");
    if (!gradleRaw) problems.push("android: android/app/build.gradle not found");
    if (pkgRaw && pbxprojRaw && gradleRaw) {
      const { version } = JSON.parse(pkgRaw);
      problems.push(...checkStampedVersions({ version, pbxproj: pbxprojRaw, gradle: gradleRaw }));
    }
    // Android push cannot work without this file. It's git-ignored (mobile/.gitignore)
    // and must be placed by hand before a release build.
    if (!fs.existsSync(path.join(root, "android/app/google-services.json"))) {
      problems.push("android: android/app/google-services.json missing — required for push notifications in a release build");
    }
  }

  if (problems.length) {
    console.error("mobile verify FAILED:\n - " + problems.join("\n - "));
    process.exit(1);
  }
  console.log("mobile verify OK");
}

if (require.main === module) main();

module.exports = {
  UA_PATTERN,
  REQUIRED_HOSTS,
  ALLOWED_WILDCARD,
  checkResolvedConfig,
  checkReleaseConfig,
  checkInfoPlist,
  checkAndroidManifest,
  checkStampedVersions,
  checkDeepLinks,
  checkPush,
};
