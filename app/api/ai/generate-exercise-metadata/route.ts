import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";
import { extractYouTubeId } from "@/lib/utils/video";
import { isSuperAdmin } from "@/lib/current-user";

import { resolveExerciseAudience, type ExerciseAudience } from "@/lib/utils/exercise-context";

// Per-audience wording. "BOTH" is used when the trainer tags a batch as suitable
// for rehab AND performance clients — metadata must then serve both populations.
const AUDIENCE_COPY: Record<ExerciseAudience, {
  description: string;
  difficulty: string;
  contraindications: string;
  population: string;
  author: string;
}> = {
  CLINICAL: {
    description: "2-3 sentence clinical description of the exercise and its purpose in a rehabilitation or general clinical fitness context, written for the general public rather than any one age group",
    difficulty: "Appropriate difficulty level for a general rehab/clinical population — default to BEGINNER unless clearly advanced",
    contraindications: "Medical conditions where this exercise should be avoided, e.g. ['Acute knee injury', 'Total knee replacement < 6 weeks']",
    population: "general rehabilitation clients of any age",
    author: "a physical therapist would give their general rehab clients",
  },
  PERFORMANCE: {
    description: "2-3 sentence description of the exercise and its purpose in an athletic training or general fitness context",
    difficulty: "Appropriate difficulty level for an athletic/general-fitness population, judged on the movement's actual technical and physical demand",
    contraindications: "Training-safety cautions — situations or conditions where this exercise should be avoided or modified, e.g. ['Acute hamstring strain', 'Unresolved shoulder instability']",
    population: "athletic/general-fitness clients",
    author: "a strength & conditioning coach would give athletic/general-fitness clients",
  },
  BOTH: {
    description: "2-3 sentence description of the exercise and its purpose, covering its use both in rehabilitation (restoring function after injury or managing a condition) and in athletic/general-fitness training",
    difficulty: "Difficulty level judged on the movement's actual technical and physical demand — it will be used with both rehab and athletic clients, so do not inflate or deflate it for either group",
    contraindications: "Medical conditions and training-safety cautions where this exercise should be avoided or modified, e.g. ['Acute knee injury', 'Unresolved shoulder instability']",
    population: "both rehabilitation clients and athletic/general-fitness clients",
    author: "a clinician-coach would give to both rehab and athletic/general-fitness clients",
  },
};

function buildMetadataFields(audience: ExerciseAudience) {
  const copy = AUDIENCE_COPY[audience];
  return {
    description: z.string().describe(copy.description),
    instructions: z.string().describe("Clear step-by-step instructions for the client, numbered list format, safety-first"),
    bodyRegion: z.array(z.enum(["LOWER_BODY", "UPPER_BODY", "CORE", "FULL_BODY", "BALANCE", "FLEXIBILITY"]))
      .min(1)
      .describe("Body region(s) targeted — an exercise can target more than one, e.g. a lunge is both LOWER_BODY and BALANCE. Return every region that genuinely applies."),
    difficultyLevel: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).describe(copy.difficulty),
    exercisePhases: z.array(z.enum(["WARMUP", "ACTIVATION", "STRENGTHENING", "MOBILITY", "COOLDOWN"]))
      .min(1)
      .describe("Workout phase(s) this exercise fits — an exercise can belong to more than one, e.g. mobility and strength. Return every phase that genuinely applies."),
    musclesTargeted: z.array(z.string()).describe("Primary muscles worked, e.g. ['Quadriceps', 'Glutes']"),
    equipmentRequired: z.array(z.enum(["None", "Resistance Band", "Dumbbells", "Yoga Mat", "Stability Ball", "Foam Roller", "Chair", "Wall", "Towel", "Step/Stair"])).describe("Equipment needed from the standard list"),
    contraindications: z.array(z.string()).describe(copy.contraindications),
    commonMistakes: z.string().describe("2-3 common form errors clients make and concise corrections"),
    defaultSets: z.number().int().min(1).max(10).describe("Recommended sets"),
    defaultReps: z.number().int().min(1).max(60).describe("Recommended reps per set"),
    isAssessment: z.boolean().describe(
      "True if this is a clinical/functional assessment or outcome-measure test used to evaluate a client (e.g. a movement screen, a timed or rep-max test, a balance/ROM test) rather than an exercise used to train them. False for ordinary strengthening, mobility, warmup, or cooldown exercises."
    ),
  };
}

function buildSchemas(audience: ExerciseAudience) {
  const metadataFields = buildMetadataFields(audience);
  return {
    // Schema for name-only flow (existing single-exercise and named upload)
    nameSchema: z.object(metadataFields),
    // Schema for YouTube flow — also produces a clean professional exercise name
    youtubeSchema: z.object({
      exerciseName: z.string().describe("Clean, professional exercise name derived from the video title. Remove channel names, 'tutorial', 'how to', video numbers. E.g. 'Standing Hip Abduction with Resistance Band'"),
      ...metadataFields,
    }),
  };
}

const CLINICAL_SYSTEM_PROMPT = `You are an expert physical therapist specializing in rehabilitation and clinical exercise programming.
Clients span the general adult population of any age — recovering from injury or surgery, or managing chronic conditions. Do not assume or reference a specific age group (e.g. do not default to senior/geriatric framing) unless the exercise name or context explicitly calls for it.
All metadata must be conservative, evidence-based, and safe for this population.
Distinguish assessment/screening exercises (e.g. movement tests, timed tests, ROM checks used to evaluate a client) from ordinary training exercises when setting isAssessment.`;

const PERFORMANCE_SYSTEM_PROMPT = `You are an expert strength & conditioning coach specializing in athletic performance and general fitness.
Clients are typically healthy athletes or general-fitness trainees training toward a performance or fitness goal — not rehabilitation.
Do not use clinical/rehab framing or geriatric language. All metadata must be practical, evidence-based coaching guidance appropriate for this population.
Distinguish assessment/screening exercises (e.g. movement tests, timed tests, performance benchmarks used to evaluate a client) from ordinary training exercises when setting isAssessment.`;

const BOTH_SYSTEM_PROMPT = `You are an expert physical therapist who is also a strength & conditioning coach.
This exercise will be used with BOTH rehabilitation clients (recovering from injury or surgery, or managing chronic conditions) AND healthy athletes or general-fitness trainees.
Write metadata that serves both groups: safe, evidence-based instructions and cautions a rehab client can follow, without clinical or geriatric framing that would feel out of place for an athlete. Do not assume a specific age group.
Distinguish assessment/screening exercises (e.g. movement tests, timed tests, ROM checks, performance benchmarks used to evaluate a client) from ordinary training exercises when setting isAssessment.`;

const SYSTEM_PROMPTS: Record<ExerciseAudience, string> = {
  CLINICAL: CLINICAL_SYSTEM_PROMPT,
  PERFORMANCE: PERFORMANCE_SYSTEM_PROMPT,
  BOTH: BOTH_SYSTEM_PROMPT,
};

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
    if (!dbUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = await isSuperAdmin();
    if (dbUser.role !== "TRAINER" && !admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    // `contexts` (array) is current; `context` (single value) is accepted for older clients.
    const audience = resolveExerciseAudience(body.contexts ?? body.context);
    const { nameSchema, youtubeSchema } = buildSchemas(audience);
    const systemPrompt = SYSTEM_PROMPTS[audience];

    // ── YouTube URL flow ─────────────────────────────────────────────────────
    if (body.youtubeUrl) {
      const { youtubeUrl } = body;

      const videoId = extractYouTubeId(youtubeUrl);
      if (!videoId) {
        return NextResponse.json({ error: "Could not parse YouTube video ID from URL." }, { status: 400 });
      }

      // Fetch video metadata from YouTube Data API v3 and transcript in parallel
      const apiKey = process.env.YOUTUBE_API_KEY;
      if (!apiKey) {
        return NextResponse.json({ error: "YouTube API key not configured." }, { status: 500 });
      }

      const dataApiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`;

      const [dataRes, transcriptResult] = await Promise.allSettled([
        fetch(dataApiUrl).then((r) => r.json()),
        YoutubeTranscript.fetchTranscript(videoId),
      ]);

      if (dataRes.status === "rejected" || !dataRes.value?.items?.length) {
        return NextResponse.json({ error: "Could not fetch YouTube video info. Check the URL and try again." }, { status: 400 });
      }

      const snippet = dataRes.value.items[0].snippet;
      const videoTitle: string = snippet.title ?? "";
      const videoDescription: string = snippet.description ?? "";
      const videoTags: string[] = snippet.tags ?? [];
      const thumbnailUrl: string =
        snippet.thumbnails?.standard?.url ??
        snippet.thumbnails?.high?.url ??
        snippet.thumbnails?.medium?.url ??
        snippet.thumbnails?.default?.url ??
        "";

      // Condense transcript — join text, cap at 3000 chars to stay within token budget
      let transcriptText = "";
      if (transcriptResult.status === "fulfilled" && transcriptResult.value?.length) {
        const raw = transcriptResult.value.map((t) => t.text).join(" ");
        transcriptText = raw.length > 3000 ? raw.slice(0, 3000) + "…" : raw;
      }

      const contextParts: string[] = [`Video title: "${videoTitle}"`];
      if (videoDescription.trim()) {
        const desc = videoDescription.length > 800 ? videoDescription.slice(0, 800) + "…" : videoDescription;
        contextParts.push(`Video description: "${desc}"`);
      }
      if (videoTags.length) {
        contextParts.push(`Tags: ${videoTags.slice(0, 20).join(", ")}`);
      }
      if (transcriptText) {
        contextParts.push(`Spoken transcript (auto-generated):\n${transcriptText}`);
      }

      const { object } = await generateObject({
        model: openai("gpt-4o"),
        schema: youtubeSchema,
        system: systemPrompt,
        prompt: `Generate comprehensive exercise metadata for a training video.

${contextParts.join("\n\n")}

Based on all available information above, create a clean exercise name and full metadata appropriate for ${AUDIENCE_COPY[audience].population}. Prioritise the transcript and description for accurate instructions and details — use the title primarily for the exercise name.`,
      });

      return NextResponse.json({
        success: true,
        data: {
          ...object,
          videoUrl: youtubeUrl,
          imageUrl: thumbnailUrl,
          videoProvider: "youtube",
        },
      });
    }

    // ── Name-only flow ───────────────────────────────────────────────────────
    const { name } = body;
    if (!name?.trim()) {
      return NextResponse.json({ error: "Exercise name or YouTube URL is required" }, { status: 400 });
    }

    const { object } = await generateObject({
      model: openai("gpt-4o"),
      schema: nameSchema,
      system: systemPrompt,
      prompt: `Generate comprehensive, accurate metadata for this exercise:

Exercise name: "${name}"

Provide practical, evidence-based metadata ${AUDIENCE_COPY[audience].author}.`,
    });

    return NextResponse.json({ success: true, data: object });
  } catch (error) {
    console.error("Failed to generate exercise metadata:", error);
    return NextResponse.json({ error: "Failed to generate metadata" }, { status: 500 });
  }
}
