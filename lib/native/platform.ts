/**
 * Native shell detection (spec §4). Pure module: safe to import from server
 * components, client components, and tests. No Next.js or DOM imports.
 */

export type NativePlatform = "ios" | "android";

export interface NativeInfo {
  /** True when the page runs inside the Capacitor shell (or a dev override). */
  isNative: boolean;
  platform?: NativePlatform;
  /** Shell version from the UA marker, e.g. "1.2.0". Undefined on web. */
  appVersion?: string;
  /**
   * Whether this shell build can register for push: the ` push` token after
   * the UA marker. Android builds without google-services.json leave it out,
   * because registering there crashes the app natively. False (or undefined,
   * on web) means never register, request permission or show the prompt.
   */
  push?: boolean;
}

export const WEB_INFO: NativeInfo = { isNative: false };

// Appended by the shell via capacitor.config.ts `appendUserAgent`:
//   InmotusApp/1.2.0 (ios) push
// The trailing ` push` token is optional (see NativeInfo.push).
// Must stay in step with mobile/scripts/verify.cjs.
const UA_MARKER = /InmotusApp\/(\d+\.\d+\.\d+)\s*\((ios|android)\)(\s+push\b)?/i;

export function parseNativeUserAgent(ua: string | null | undefined): NativeInfo {
  if (!ua) return WEB_INFO;
  const match = UA_MARKER.exec(ua);
  if (!match) return WEB_INFO;
  return {
    isNative: true,
    platform: match[2].toLowerCase() as NativePlatform,
    appVersion: match[1],
    push: match[3] !== undefined,
  };
}

export interface ResolveNativeInput {
  /** `Capacitor.getPlatform()`: "ios" | "android" | "web". */
  capacitorPlatform: string;
  /** `?native=` query value or stored override. "off" clears it. */
  override?: string | null;
  /** Only dev builds (or NEXT_PUBLIC_NATIVE_DEBUG=1) may honor the override. */
  allowOverride: boolean;
  /** `navigator.userAgent`, read only for the ` push` token. */
  userAgent?: string | null;
}

/** Client-side resolution: runtime platform wins; dev override is a fallback. */
export function resolveNativeInfo(input: ResolveNativeInput): NativeInfo {
  if (input.capacitorPlatform === "ios" || input.capacitorPlatform === "android") {
    // Fail-safe: no (or an unparseable) UA marker means no push.
    const push = parseNativeUserAgent(input.userAgent).push === true;
    return { isNative: true, platform: input.capacitorPlatform, push };
  }
  if (input.allowOverride && input.override) {
    const value = input.override.toLowerCase();
    if (value === "ios" || value === "android") {
      // A desktop browser faking the shell has no push plugin to call.
      return { isNative: true, platform: value, appVersion: "0.0.0-debug", push: false };
    }
  }
  return WEB_INFO;
}
