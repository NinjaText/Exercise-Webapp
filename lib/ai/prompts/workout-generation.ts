import type { Exercise } from "@prisma/client";

export function buildSystemPrompt(candidateExercises: Exercise[]): string {
  const exerciseList = candidateExercises
    .map(
      (e) =>
        `- ID: ${e.id} | Name: ${e.name} | Region: ${e.bodyRegion.join("/")} | Difficulty: ${e.difficultyLevel} | Equipment: ${(e.equipmentRequired ?? []).join(", ") || "bodyweight"} | Contraindications: ${(e.contraindications ?? []).join(", ") || "none"}`
    )
    .join("\n");

  return `You are a clinical exercise prescription assistant helping healthcare professionals create safe, effective home exercise programs.

CRITICAL SAFETY RULES:
1. NEVER recommend exercises that conflict with a client's documented contraindications or limitations.
2. NEVER exceed the prescribed difficulty level for the client's current fitness level.
3. ALWAYS include a warm-up and cool-down phase.
4. ALWAYS respect equipment availability - only select exercises the client has equipment for.
5. If a client reports pain conditions, prefer lower-intensity alternatives.
6. Balance the workout across the requested muscle groups and movement patterns.
7. Include appropriate rest periods between exercises (30-90 seconds depending on intensity).

EXERCISE SELECTION PROCESS:
- Review the client profile carefully for contraindications.
- Select exercises that match the client's goals and available equipment.
- Build a progressive program starting with warm-up, main exercises, then cool-down.
- Prescribe appropriate sets, reps, and rest periods for each exercise.
- Provide a brief rationale for each exercise selection.

AVAILABLE EXERCISES:
${exerciseList}

When selecting exercises, use the select_exercise tool for each exercise you want to include in the plan. You must select exercise IDs from the available exercises list above. Do not invent exercise IDs.

After selecting all exercises, provide a brief overall rationale for the workout plan.`;
}

export function buildUserPrompt(params: {
  limitations?: string | null;
  comorbidities?: string | null;
  functionalChallenges?: string | null;
  availableEquipment: string[];
  durationMinutes: number;
  daysPerWeek: number;
  fitnessGoals: string[];
}): string {
  const parts: string[] = [
    "Please create a home exercise program for a client with the following profile:",
    "",
  ];

  if (params.limitations) {
    parts.push(`Physical Limitations: ${params.limitations}`);
  }
  if (params.comorbidities) {
    parts.push(`Medical Conditions/Comorbidities: ${params.comorbidities}`);
  }
  if (params.functionalChallenges) {
    parts.push(`Functional Challenges: ${params.functionalChallenges}`);
  }

  parts.push(
    `Available Equipment: ${params.availableEquipment.length > 0 ? params.availableEquipment.join(", ") : "bodyweight only"}`
  );
  parts.push(`Target Workout Duration: ${params.durationMinutes} minutes`);
  parts.push(`Days Per Week: ${params.daysPerWeek}`);
  parts.push(
    `Fitness Goals: ${params.fitnessGoals.length > 0 ? params.fitnessGoals.join(", ") : "general fitness"}`
  );
  parts.push("");
  parts.push(
    "Select appropriate exercises using the select_exercise tool. Include warm-up, main exercises, and cool-down. Provide sets, reps or duration, and rest periods for each exercise."
  );

  return parts.join("\n");
}
