import type { CapacitorConfig } from "@capacitor/cli";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// CommonJS require keeps this loadable by the Capacitor CLI's TypeScript 5 transpile.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { resolveServerUrl } = require("./server-url.cjs") as { resolveServerUrl: () => string };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { resolveClerkHost } = require("./clerk-host.cjs") as { resolveClerkHost: () => string | null };

// mobile/package.json "version" is the single app version: it feeds the
// user-agent suffix the web app parses, and scripts/set-version.cjs stamps it
// into the Xcode and Gradle projects.
const { version } = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8")) as { version: string };
const serverUrl = resolveServerUrl();
// Only this app's own Clerk frontend-API host (decoded from the publishable
// key) — never a wildcard on accounts.dev, where anyone can register an
// instance. A production Clerk host on *.goinmotus.com is already covered.
const clerkHost = resolveClerkHost();
const allowNavigation = [
  "app.goinmotus.com",
  "*.goinmotus.com",
  ...(clerkHost && !clerkHost.endsWith(".goinmotus.com") ? [clerkHost] : []),
];

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
    allowNavigation,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 5000,
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
