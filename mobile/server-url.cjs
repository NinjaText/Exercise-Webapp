/**
 * Single source for the URL the native shell loads. `CAP_SERVER_URL` points a
 * dev or preview build at another host (e.g. http://192.168.1.20:3000).
 */
const DEFAULT_SERVER_URL = "https://app.goinmotus.com";

function resolveServerUrl(env = process.env) {
  const raw = (env.CAP_SERVER_URL || "").trim() || DEFAULT_SERVER_URL;
  return raw.replace(/\/+$/, "");
}

module.exports = { DEFAULT_SERVER_URL, resolveServerUrl };
