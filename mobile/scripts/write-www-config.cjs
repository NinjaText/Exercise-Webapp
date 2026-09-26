/** Writes www/server-url.js so the bundled offline page knows where Retry goes. */
const fs = require("node:fs");
const path = require("node:path");
const { resolveServerUrl } = require("../server-url.cjs");

const url = resolveServerUrl();
const out = path.join(__dirname, "..", "www", "server-url.js");
fs.writeFileSync(out, `window.INMOTUS_SERVER_URL = ${JSON.stringify(url)};\n`);
console.log(`wrote www/server-url.js -> ${url}`);
