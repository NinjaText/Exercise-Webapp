/**
 * The one Clerk frontend-API host the native shell may navigate to in-webview
 * (Clerk's handshake). It is encoded in the publishable key:
 * pk_test_<base64("<host>$")> / pk_live_<base64("<host>$")>.
 *
 * The key is publishable, but it is still never printed — only the host.
 */
const fs = require("node:fs");
const path = require("node:path");

const KEY_NAME = "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY";
const HOST_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

function clerkHostFromPublishableKey(key) {
  if (typeof key !== "string") return null;
  const m = /^pk_(test|live)_([A-Za-z0-9+/=_-]+)$/.exec(key.trim());
  if (!m) return null;
  let decoded;
  try {
    decoded = Buffer.from(m[2].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return null;
  }
  if (!decoded.endsWith("$")) return null;
  const host = decoded.slice(0, -1).toLowerCase();
  return HOST_PATTERN.test(host) ? host : null;
}

function readKeyFromEnvFile(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[1].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    if (value) return value;
  }
  return null;
}

/** The environment wins; otherwise the repo root .env.local, then .env. */
function resolveClerkHost(env = process.env, rootDir = path.join(__dirname, "..")) {
  const fromEnv = (env[KEY_NAME] || "").trim();
  if (fromEnv) return clerkHostFromPublishableKey(fromEnv);
  for (const name of [".env.local", ".env"]) {
    const key = readKeyFromEnvFile(path.join(rootDir, name));
    if (key) return clerkHostFromPublishableKey(key);
  }
  return null;
}

module.exports = { clerkHostFromPublishableKey, resolveClerkHost };
