"use server";

import OpenAI from "openai";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const replacementSchema = z.object({
  replacements: z.array(z.object({
    selectedExerciseId: z.string().min(1),
    replacementExerciseId: z.string().min(1),
    rationale: z.string().min(1).max(500),
  })).min(1).max(20),
});

export async function suggestExerciseReplacementsAction(input: {
  selectedExercises: { id: string; name: string; description?: string | null }[];
  exerciseLibrary: { id: string; name: string; description?: string | null; bodyRegion?: string[] }[];
  coachInstructions: string;
}) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const user = await prisma.user.findUnique({ where: { clerkId: userId }, select: { role: true } });
  if (!user || user.role !== "TRAINER") {
    return { success: false as const, error: "Unauthorized" };
  }

  const instructions = input.coachInstructions.trim();
  if (!instructions) return { success: false as const, error: "Please describe what should change" };
  if (input.selectedExercises.length === 0 || input.selectedExercises.length > 20) {
    return { success: false as const, error: "Select between 1 and 20 exercises" };
  }

  const libraryById = new Map(input.exerciseLibrary.map((exercise) => [exercise.id, exercise]));
  const selectedIds = new Set(input.selectedExercises.map((exercise) => exercise.id));
  if (input.selectedExercises.some((exercise) => !libraryById.has(exercise.id))) {
    return { success: false as const, error: "One or more selected exercises are unavailable" };
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You help a trainer revise an exercise program.",
            "Return exactly one replacement for every selected exercise.",
            "Choose replacementExerciseId only from the provided exercise library.",
            "Do not choose the selected exercise itself. Keep the replacement's training purpose aligned unless the trainer requests otherwise.",
            "Return JSON: { replacements: [{ selectedExerciseId, replacementExerciseId, rationale }] }.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            coachInstructions: instructions,
            selectedExercises: input.selectedExercises,
            exerciseLibrary: input.exerciseLibrary,
          }),
        },
      ],
    });

    const parsedJson: unknown = JSON.parse(response.choices[0]?.message.content ?? "{}");
    const parsed = replacementSchema.safeParse(parsedJson);
    if (!parsed.success || parsed.data.replacements.length !== input.selectedExercises.length) {
      return { success: false as const, error: "AI returned an incomplete revision. Please try again." };
    }

    const seenSelectedIds = new Set<string>();
    for (const replacement of parsed.data.replacements) {
      if (
        !selectedIds.has(replacement.selectedExerciseId) ||
        seenSelectedIds.has(replacement.selectedExerciseId) ||
        !libraryById.has(replacement.replacementExerciseId) ||
        replacement.selectedExerciseId === replacement.replacementExerciseId
      ) {
        return { success: false as const, error: "AI returned an invalid exercise revision. Please try again." };
      }
      seenSelectedIds.add(replacement.selectedExerciseId);
    }

    return { success: true as const, data: parsed.data.replacements };
  } catch (error) {
    console.error("Failed to suggest exercise replacements:", error);
    return { success: false as const, error: "Unable to revise exercises right now" };
  }
}