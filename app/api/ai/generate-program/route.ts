import { streamObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const blockExerciseSchema = z.object({
  exerciseId: z.string().describe("The exact ID of the selected exercise from the provided catalog."),
  sets: z.number().optional().describe("Number of sets (if applicable)"),
  reps: z.number().optional().describe("Number of repetitions per set"),
  durationSeconds: z.number().optional().describe("Duration in seconds (e.g., 60 for 1 min hold)"),
  restSeconds: z.number().optional().describe("Rest period after exercise in seconds"),
  notes: z.string().optional().describe("Trainer guidance, e.g., 'keep back straight'")
});

const workoutBlockSchema = z.object({
  name: z.string().describe("Block name, e.g., 'Warmup', 'Main Lifts', 'Cool-down'"),
  description: z.string().optional().describe("Overview of the block's intent"),
  exercises: z.array(blockExerciseSchema).describe("The exercises inside this block")
});

const workoutPlanSchema = z.object({
  title: z.string().describe("A catchy name for the workout plan"),
  description: z.string().optional().describe("Brief description on why this plan exists"),
  daysPerWeek: z.number().optional().describe("Suggested days per week to run this plan"),
  blocks: z.array(workoutBlockSchema).describe("List of blocks inside this plan (e.g., Warmup, Main, Cooldown)")
});

export const maxDuration = 60; // Allow enough time for LLM

export async function POST(req: Request) {
  try {
    const { painLevel, availableEquipment, daysPerWeek, additionalNotes } = await req.json();

    // Fetch exercises to act as context
    const exercisesResult = await prisma.exercise.findMany({
      select: { id: true, name: true },
      where: {
        isActive: true,
      }
    });

    const contextExercises = exercisesResult.map(e => ({
      id: e.id,
      name: e.name
    }));

    const result = await streamObject({
      model: openai("gpt-4o"),
      schema: workoutPlanSchema,
      prompt: `You are an expert physical therapist and strength coach.
Generate a structured workout plan. 
Client Context:
- Pain Level (1-10): ${painLevel || "Not specified"}
- Available Equipment: ${availableEquipment || "Bodyweight only"}
- Target Days/Week: ${daysPerWeek || "3"}
- Additional Notes: ${additionalNotes || "None"}

You MUST ONLY pick exercises from the following actual catalog. Use the exact 'id' for the blockExercise.
Allowed Exercises:
${JSON.stringify(contextExercises, null, 2)}
`,
    });

    return result.toTextStreamResponse();
  } catch (err: any) {
    console.error("Error generating program:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
