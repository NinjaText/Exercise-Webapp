import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!user) return new NextResponse("User not found", { status: 404 });

  // Club members poll this after checkout too; same `{ subscription: { status } }` shape.
  if (user.role === "CLIENT") {
    const subscription = await prisma.memberSubscription.findUnique({ where: { userId: user.id } });
    // Coaching is polled for after its own checkout (?coaching=1); membership-only callers ignore it.
    const coaching = await prisma.memberCoaching.findUnique({
      where: { userId: user.id },
      select: { status: true },
    });
    return NextResponse.json({ subscription, coaching });
  }

  const subscription = await prisma.trainerSubscription.findUnique({
    where: { trainerId: user.id },
  });

  return NextResponse.json({ subscription });
}
