import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { touchLastActive } from "@/lib/activity/last-active";

/** Client heartbeat for "last active" (components/activity/activity-heartbeat.tsx). */
export async function POST() {
  const { userId } = await auth();
  if (!userId) return new NextResponse(null, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { id: true, lastActiveAt: true, isActive: true },
  });
  if (user && user.isActive !== false) touchLastActive(user);

  return new NextResponse(null, { status: 204 });
}
