import { activeUserOnly } from "@/lib/auth/active-user";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateWorkoutPlan } from "@/lib/services/ai.service";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUser = activeUserOnly(await prisma.user.findUnique({ where: { clerkId: userId } }));
  if (!dbUser || dbUser.role !== "TRAINER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const plan = await generateWorkoutPlan(body);
    return NextResponse.json({ success: true, data: plan });
  } catch (error) {
    console.error("AI generation failed:", error);
    return NextResponse.json(
      { error: "Failed to generate workout plan" },
      { status: 500 }
    );
  }
}
