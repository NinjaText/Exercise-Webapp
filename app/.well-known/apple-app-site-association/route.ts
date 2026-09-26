import { NextResponse } from "next/server";
import { buildAppleAppSiteAssociation } from "@/lib/native/deep-links";

export function GET() {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  if (!teamId) return new NextResponse("Not configured", { status: 404 });
  return NextResponse.json(buildAppleAppSiteAssociation(teamId), {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
