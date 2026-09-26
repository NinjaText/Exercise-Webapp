const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveServerUrl, DEFAULT_SERVER_URL } = require("../server-url.cjs");
const {
  checkResolvedConfig,
  checkReleaseConfig,
  UA_PATTERN,
  checkInfoPlist,
  checkAndroidManifest,
  checkStampedVersions,
} = require("./verify.cjs");

test("resolveServerUrl defaults to production and trims trailing slashes", () => {
  assert.equal(resolveServerUrl({}), DEFAULT_SERVER_URL);
  assert.equal(resolveServerUrl({ CAP_SERVER_URL: "  " }), DEFAULT_SERVER_URL);
  assert.equal(resolveServerUrl({ CAP_SERVER_URL: "http://192.168.1.20:3000/" }), "http://192.168.1.20:3000");
});

const good = (platform) => ({
  appId: "com.goinmotus.app",
  appName: "Inmotus RX",
  [platform]: {
    appendUserAgent: `InmotusApp/1.0.0 (${platform})`,
    ...(platform === "ios" ? { contentInset: "never" } : {}),
  },
  server: {
    url: "https://app.goinmotus.com",
    cleartext: false,
    errorPath: "offline.html",
    allowNavigation: ["app.goinmotus.com", "*.goinmotus.com", "*.clerk.accounts.dev", "*.accounts.dev"],
  },
  plugins: {
    SplashScreen: { launchAutoHide: true, launchShowDuration: 5000, launchFadeOutDuration: 200 },
    StatusBar: { style: "LIGHT" },
    SystemBars: { insetsHandling: "css", initialViewportFitValueHint: "cover" },
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

test("flags disabled splash screen auto-hide", () => {
  const c = good("android");
  c.plugins.SplashScreen.launchAutoHide = false;
  assert.ok(checkResolvedConfig(c, "android", files).some((p) => p.includes("SplashScreen.launchAutoHide")));
});

test("flags a wrong status bar style", () => {
  const c = good("android");
  c.plugins.StatusBar.style = "DARK";
  assert.ok(checkResolvedConfig(c, "android", files).some((p) => p.includes("StatusBar.style")));
});

test("flags a non-never iOS contentInset", () => {
  const c = good("ios");
  c.ios.contentInset = "automatic";
  assert.ok(checkResolvedConfig(c, "ios", files).some((p) => p.includes("contentInset")));
});

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

test("checkReleaseConfig passes a production config", () => {
  assert.deepEqual(checkReleaseConfig(good("ios"), "ios"), []);
});

test("checkReleaseConfig flags a LAN dev URL", () => {
  const c = good("android");
  c.server.url = "http://192.168.1.20:3000";
  c.server.cleartext = true;
  const problems = checkReleaseConfig(c, "android");
  assert.ok(problems.some((p) => p.includes("server.url")));
  assert.ok(problems.some((p) => p.includes("cleartext")));
});

test("checkReleaseConfig flags a preview deployment URL", () => {
  const c = good("ios");
  c.server.url = "https://preview-xyz.vercel.app";
  assert.ok(checkReleaseConfig(c, "ios").some((p) => p.includes("server.url")));
});

const pbxproj = (marketing, code) => `
				CURRENT_PROJECT_VERSION = ${code};
				MARKETING_VERSION = ${marketing};
				PRODUCT_BUNDLE_IDENTIFIER = com.goinmotus.app;
				CURRENT_PROJECT_VERSION = ${code};
				MARKETING_VERSION = ${marketing};
`;
const gradle = (name, code) => `
        versionCode ${code}
        versionName "${name}"
`;

test("checkStampedVersions passes when native files match package.json", () => {
  assert.deepEqual(
    checkStampedVersions({ version: "1.2.3", pbxproj: pbxproj("1.2.3", 10203), gradle: gradle("1.2.3", 10203) }),
    []
  );
});

test("checkStampedVersions flags both platforms when the package was bumped but not stamped", () => {
  const problems = checkStampedVersions({
    version: "1.3.0",
    pbxproj: pbxproj("1.2.3", 10203),
    gradle: gradle("1.2.3", 10203),
  });
  assert.ok(problems.some((p) => p.includes("ios") && p.includes("MARKETING_VERSION")));
  assert.ok(problems.some((p) => p.includes("ios") && p.includes("CURRENT_PROJECT_VERSION")));
  assert.ok(problems.some((p) => p.includes("android") && p.includes("versionName")));
  assert.ok(problems.some((p) => p.includes("android") && p.includes("versionCode")));
});

test("checkStampedVersions flags a stale occurrence when only one of two pbxproj entries was stamped", () => {
  const stale = `
				CURRENT_PROJECT_VERSION = 10203;
				MARKETING_VERSION = 1.2.3;
				CURRENT_PROJECT_VERSION = 10102;
				MARKETING_VERSION = 1.1.2;
`;
  const problems = checkStampedVersions({ version: "1.2.3", pbxproj: stale, gradle: gradle("1.2.3", 10203) });
  assert.ok(problems.some((p) => p.includes("MARKETING_VERSION is 1.1.2")));
  assert.ok(problems.some((p) => p.includes("CURRENT_PROJECT_VERSION is 10102")));
  assert.equal(problems.filter((p) => p.includes("ios")).length, 2);
});
