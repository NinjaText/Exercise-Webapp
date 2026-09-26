const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { clerkHostFromPublishableKey, resolveClerkHost } = require("../clerk-host.cjs");

const HOST = "abc-123.clerk.accounts.dev";
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
const TEST_KEY = `pk_test_${b64(`${HOST}$`)}`;

test("decodes the frontend-API host from a pk_test_ / pk_live_ key", () => {
  assert.equal(clerkHostFromPublishableKey(TEST_KEY), HOST);
  assert.equal(clerkHostFromPublishableKey(`pk_live_${b64("clerk.goinmotus.com$")}`), "clerk.goinmotus.com");
});

test("returns null for missing or malformed keys", () => {
  for (const bad of [undefined, null, "", "pk_test_", "sk_test_" + b64(`${HOST}$`), `pk_test_${b64(HOST)}`,
    `pk_prod_${b64(`${HOST}$`)}`, "pk_test_!!!", `pk_test_${b64("not a host$")}`, `pk_test_${b64("evil.com/x$")}`]) {
    assert.equal(clerkHostFromPublishableKey(bad), null, String(bad));
  }
});

test("resolveClerkHost prefers the environment, then .env.local, then .env", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clerk-host-"));
  try {
    assert.equal(resolveClerkHost({}, dir), null);
    fs.writeFileSync(path.join(dir, ".env"), `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_${b64("from-env-file.clerk.accounts.dev$")}\n`);
    assert.equal(resolveClerkHost({}, dir), "from-env-file.clerk.accounts.dev");
    fs.writeFileSync(path.join(dir, ".env.local"), `# comment\nOTHER=1\nNEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="${TEST_KEY}"\n`);
    assert.equal(resolveClerkHost({}, dir), HOST);
    const envKey = `pk_test_${b64("from-process.clerk.accounts.dev$")}`;
    assert.equal(resolveClerkHost({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: envKey }, dir), "from-process.clerk.accounts.dev");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
