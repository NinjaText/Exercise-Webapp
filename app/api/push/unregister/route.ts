import { NextResponse } from "next/server";
import { isValidPushToken, unregisterToken } from "@/lib/services/push-device.service";

/**
 * No auth: called right after sign-out, when there is no Clerk session left
 * to check. Possessing the token is proof of the device, the same trust
 * model as `unregisterToken`'s unscoped delete path.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const token = (body as { token?: unknown } | null)?.token;
  if (!isValidPushToken(token)) {
    return new NextResponse(null, { status: 400 });
  }

  await unregisterToken(token);
  return new NextResponse(null, { status: 204 });
}
