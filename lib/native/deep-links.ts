import paths from "./deep-link-paths.json";

export const APP_HOST = "app.goinmotus.com";
export const APP_SCHEME = "inmotus";
export const APP_ID = "com.goinmotus.app";
/** Single source for the AASA route, the Android manifest check and tests. */
export const DEEP_LINK_PATH_PREFIXES: readonly string[] = paths;

// Backslashes are treated as "/" by the URL parser for http(s), so "/\evil.com"
// would resolve as the protocol-relative "//evil.com". Control characters have
// no business in a deep link either.
const UNSAFE_CHARS = /[\\\u0000-\u001f\u007f]/;

/**
 * Resolve the candidate against the app origin and accept it only if it stays
 * there — pattern-matching the string alone misses the parser's quirks.
 */
function safePath(candidate: string, host: string): string | null {
  if (!candidate.startsWith("/") || candidate.startsWith("//") || UNSAFE_CHARS.test(candidate)) return null;
  const origin = `https://${host}`;
  let resolved: URL;
  try {
    resolved = new URL(candidate, origin);
  } catch {
    return null;
  }
  if (resolved.origin !== origin) return null;
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

export function pathFromAppUrl(url: string, host: string = APP_HOST): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol === "https:" && u.hostname === host) {
    return safePath(`${u.pathname}${u.search}${u.hash}`, host);
  }
  if (u.protocol === `${APP_SCHEME}:`) {
    // inmotus://clients/42 parses with host "clients"; inmotus:///x has an empty host.
    const path = u.host ? `/${u.host}${u.pathname === "/" ? "" : u.pathname}` : u.pathname;
    return safePath(`${path}${u.search}${u.hash}`, host);
  }
  return null;
}

export function buildAppleAppSiteAssociation(teamId: string) {
  return {
    applinks: {
      details: [
        {
          appIDs: [`${teamId}.${APP_ID}`],
          components: DEEP_LINK_PATH_PREFIXES.flatMap((p) => [{ "/": p }, { "/": `${p}/*` }]),
        },
      ],
    },
  };
}

export function buildAssetLinks(fingerprints: string[]) {
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: APP_ID, sha256_cert_fingerprints: fingerprints },
    },
  ];
}
