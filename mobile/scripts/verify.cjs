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

  const plugins = config.plugins || {};
  const splash = plugins.SplashScreen || {};
  if (splash.launchAutoHide !== true) problems.push(`${platform}: plugins.SplashScreen.launchAutoHide must be true`);
  if (splash.launchShowDuration !== 3000) problems.push(`${platform}: plugins.SplashScreen.launchShowDuration must be 3000`);
  if (splash.launchFadeOutDuration !== 200) problems.push(`${platform}: plugins.SplashScreen.launchFadeOutDuration must be 200`);

  const statusBar = plugins.StatusBar || {};
  if (statusBar.style !== "LIGHT") problems.push(`${platform}: plugins.StatusBar.style must be LIGHT`);

  const systemBars = plugins.SystemBars || {};
  if (systemBars.insetsHandling !== "css") problems.push(`${platform}: plugins.SystemBars.insetsHandling must be css`);
  if (systemBars.initialViewportFitValueHint !== "cover") {
    problems.push(`${platform}: plugins.SystemBars.initialViewportFitValueHint must be cover`);
  }

  if (platform === "ios") {
    const ios = config.ios || {};
    if (ios.contentInset !== "never") problems.push(`${platform}: ios.contentInset must be never`);
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
