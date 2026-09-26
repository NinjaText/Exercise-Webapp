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
