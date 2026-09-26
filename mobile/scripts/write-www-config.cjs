/** Writes www/server-url.js so the bundled offline page knows where Retry goes. */
const fs = require("node:fs");
const path = require("node:path");
const { resolveServerUrl } = require("../server-url.cjs");
const { resolveClerkHost } = require("../clerk-host.cjs");

const url = resolveServerUrl();
const out = path.join(__dirname, "..", "www", "server-url.js");
fs.writeFileSync(out, `window.INMOTUS_SERVER_URL = ${JSON.stringify(url)};\n`);
console.log(`wrote www/server-url.js -> ${url}`);

// Mirrors what capacitor.config.ts puts in allowNavigation. Host only — never the key.
const clerkHost = resolveClerkHost();
if (clerkHost) {
  console.log(`clerk frontend-API host -> ${clerkHost}`);
} else {
  console.warn(
    "WARNING: no Clerk host resolved (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY not in the environment, .env.local or .env) — sign-in will leave the app"
  );
}
