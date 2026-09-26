import { parseNativeUserAgent } from "./platform";

/**
 * The marketing landing page lists plan prices, which must not appear inside
 * the native shell (Apple 3.1.1). Decided in proxy.ts so "/" stays static.
 */
export function nativeLandingRedirect(pathname: string, userAgent: string | null, signedIn: boolean): string | null {
  if (pathname !== "/") return null;
  if (!parseNativeUserAgent(userAgent).isNative) return null;
  return signedIn ? "/dashboard" : "/sign-in";
}
