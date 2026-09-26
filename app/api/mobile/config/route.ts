import { NextResponse } from "next/server";
import type { MobileConfig } from "@/lib/native/version";

export function GET() {
  const body: MobileConfig = {
    minSupportedVersion: {
      ios: process.env.MOBILE_MIN_VERSION_IOS?.trim() || "1.0.0",
      android: process.env.MOBILE_MIN_VERSION_ANDROID?.trim() || "1.0.0",
    },
    storeUrls: {
      ios: process.env.NEXT_PUBLIC_IOS_STORE_URL?.trim() || null,
      android: process.env.NEXT_PUBLIC_ANDROID_STORE_URL?.trim() || null,
    },
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "public, max-age=300" } });
}
