"use server";

import { cookies, headers } from "next/headers";
import { getClubBySlug } from "@/lib/services/club.service";
import { CLUB_NOT_OPEN_MESSAGE, getClubTrainer } from "@/lib/services/club-trainer.service";
import { isJoinRateLimited, recordFailedJoinAttempt } from "@/lib/services/join-attempt.service";
import { JOIN_COOKIE, JOIN_TOKEN_TTL_MS, joinCodesMatch, signJoinToken } from "@/lib/clubs/join-token";

const GENERIC_ERROR = "That code didn't work. Check with your club and try again.";

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/**
 * Step 1 of joining a club. Unknown club and wrong code give the same message
 * so the page can't be used to discover which clubs exist.
 */
export async function verifyJoinCodeAction(
  slug: string,
  code: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Same normalisation as getClubBySlug, so /join/PINE and /join/pine share a counter.
  const key = `${await clientIp()}:${slug.trim().toLowerCase()}`;
  if (await isJoinRateLimited(key)) {
    return { ok: false, error: "Too many attempts. Please wait 15 minutes and try again." };
  }

  const club = await getClubBySlug(slug);
  if (!club || !joinCodesMatch(code, club.joinCode)) {
    await recordFailedJoinAttempt(key);
    return { ok: false, error: GENERIC_ERROR };
  }
  // Checked after the code, so a closed club isn't revealed to guessers (D5).
  if (!(await getClubTrainer(club.clerkOrgId))) {
    return { ok: false, error: CLUB_NOT_OPEN_MESSAGE };
  }

  (await cookies()).set(JOIN_COOKIE, signJoinToken(club.clerkOrgId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/join",
    maxAge: JOIN_TOKEN_TTL_MS / 1000,
  });
  return { ok: true };
}
