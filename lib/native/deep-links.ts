import paths from "./deep-link-paths.json";

export const APP_HOST = "app.goinmotus.com";
export const APP_SCHEME = "inmotus";
export const APP_ID = "com.goinmotus.app";
/** Single source for the AASA route, the Android manifest check and tests. */
export const DEEP_LINK_PATH_PREFIXES: readonly string[] = paths;

function safePath(path: string): string | null {
  // "//evil.com" would be a protocol-relative URL: never navigate there.
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  return path;
}

export function pathFromAppUrl(url: string, host: string = APP_HOST): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol === "https:" && u.hostname === host) {
    return safePath(`${u.pathname}${u.search}${u.hash}`);
  }
  if (u.protocol === `${APP_SCHEME}:`) {
    // inmotus://clients/42 parses with host "clients"; inmotus:///x has an empty host.
    const path = u.host ? `/${u.host}${u.pathname === "/" ? "" : u.pathname}` : u.pathname;
    return safePath(`${path}${u.search}${u.hash}`);
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
