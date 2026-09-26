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
