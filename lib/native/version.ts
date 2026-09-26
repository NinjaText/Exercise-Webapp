/**
 * Remote minimum-version gate (spec: mobile store rules). Pure comparison
 * plus one orchestration function whose config fetch is injected, so it is
 * testable without a network call. Bad or missing config must never lock
 * users out: any parse failure resolves to "not blocked".
 */

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

function parse(v: string | undefined): [number, number, number] | null {
  const m = v ? SEMVER.exec(v.trim()) : null;
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** False whenever either side is missing or malformed: bad config must never lock users out. */
export function isVersionBelow(current: string | undefined, minimum: string | undefined): boolean {
  const a = parse(current);
  const b = parse(minimum);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}

export interface MobileConfig {
  minSupportedVersion: { ios: string; android: string };
  storeUrls: { ios: string | null; android: string | null };
}

export async function checkForRequiredUpdate(args: {
  platform: "ios" | "android";
  appVersion: string;
  fetchConfig: () => Promise<MobileConfig>;
}): Promise<{ storeUrl: string | null } | null> {
  let config: MobileConfig;
  try {
    config = await args.fetchConfig();
  } catch {
    return null;
  }
  if (!isVersionBelow(args.appVersion, config.minSupportedVersion?.[args.platform])) return null;
  return { storeUrl: config.storeUrls?.[args.platform] ?? null };
}
