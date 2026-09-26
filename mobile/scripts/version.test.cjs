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
