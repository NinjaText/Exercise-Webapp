import { NextResponse } from "next/server";
import { buildAssetLinks } from "@/lib/native/deep-links";

export function GET() {
  const fingerprints = (process.env.ANDROID_SHA256_CERT_FINGERPRINTS ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  if (fingerprints.length === 0) return new NextResponse("Not configured", { status: 404 });
  return NextResponse.json(buildAssetLinks(fingerprints), { headers: { "Cache-Control": "public, max-age=3600" } });
}
