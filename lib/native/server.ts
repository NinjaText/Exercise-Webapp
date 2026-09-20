import { headers } from "next/headers";
import { parseNativeUserAgent, type NativeInfo } from "./platform";

/**
 * Server-side native detection from the request user agent. Only call this
 * from routes that are already dynamic (they use auth() or headers()); it
 * forces dynamic rendering wherever it is used.
 */
export async function getNativeInfo(): Promise<NativeInfo> {
  const requestHeaders = await headers();
  return parseNativeUserAgent(requestHeaders.get("user-agent"));
}
