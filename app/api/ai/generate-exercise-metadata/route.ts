import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";
import { extractYouTubeId } from "@/lib/utils/video";
import { isSuperAdmin } from "@/lib/current-user";

type ExerciseContext = "CLINICAL" | "PERFORMANCE";

function buildMetadataFields(context: ExerciseContext) {
  const isClinical = context === "CLINICAL";
  return {
    description: z.string().describe(
      isClinical
        ? "2-3 sentence clinical description of the exercise and its purpose in a rehabilitation or senior fitness context"
        : "2-3 sentence description of the exercise and its purpose in an athletic training or general fitness context"
    ),
    instructions: z.string().describe("Clear step-by-step instructions for the client, numbered list format, safety-first"),
    bodyRegion: z.array(z.enum(["LOWER_BODY", "UPPER_BODY", "CORE", "FULL_BODY", "BALANCE", "FLEXIBILITY"]))
      .min(1)
      .describe("Body region(s) targeted — an exercise can target more than one, e.g. a lunge is both LOWER_BODY and BALANCE. Return every region that genuinely applies."),
    difficultyLevel: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).describe(
      isClinical
        ? "Appropriate difficulty level for a senior/rehab population — default to BEGINNER unless clearly advanced"
        : "Appropriate difficulty level for an athletic/general-fitness population, judged on the movement's actual technical and physical demand"
    ),
    exercisePhases: z.array(z.enum(["WARMUP", "ACTIVATION", "STRENGTHENING", "MOBILITY", "COOLDOWN"]))
      .min(1)
      .describe("Workout phase(s) this exercise fits — an exercise can belong to more than one, e.g. mobility and strength. Return every phase that genuinely applies."),
    musclesTargeted: z.array(z.string()).describe("Primary muscles worked, e.g. ['Quadriceps', 'Glutes']"),
    equipmentRequired: z.array(z.enum(["None", "Resistance Band", "Dumbbells", "Yoga Mat", "Stability Ball", "Foam Roller", "Chair", "Wall", "Towel", "Step/Stair"])).describe("Equipment needed from the standard list"),
    contraindications: z.array(z.string()).describe(
      isClinical
        ? "Medical conditions where this exercise should be avoided, e.g. ['Acute knee injury', 'Total knee replacement < 6 weeks']"
        : "Training-safety cautions — situations or conditions where this exercise should be avoided or modified, e.g. ['Acute hamstring strain', 'Unresolved shoulder instability']"
    ),
    commonMistakes: z.string().describe("2-3 common form errors clients make and concise corrections"),
    defaultSets: z.number().int().min(1).max(10).describe("Recommended sets"),
    defaultReps: z.number().int().min(1).max(60).describe("Recommended reps per set"),
  };
}

function buildSchemas(context: ExerciseContext) {
  const metadataFields = buildMetadataFields(context);
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

const CLINICAL_SYSTEM_PROMPT = `You are an expert physical therapist specializing in senior rehabilitation and geriatric fitness.
Clients are typically older adults (60+) recovering from injury or surgery, or managing chronic conditions.
All metadata must be conservative, evidence-based, and safe for this population.`;

const PERFORMANCE_SYSTEM_PROMPT = `You are an expert strength & conditioning coach specializing in athletic performance and general fitness.
Clients are typically healthy athletes or general-fitness trainees training toward a performance or fitness goal — not rehabilitation.
Do not use clinical/rehab framing or geriatric language. All metadata must be practical, evidence-based coaching guidance appropriate for this population.`;

function systemPromptFor(context: ExerciseContext): string {
  return context === "CLINICAL" ? CLINICAL_SYSTEM_PROMPT : PERFORMANCE_SYSTEM_PROMPT;
}

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
    const exerciseContext: ExerciseContext = body.context === "PERFORMANCE" ? "PERFORMANCE" : "CLINICAL";
    const { nameSchema, youtubeSchema } = buildSchemas(exerciseContext);
    const systemPrompt = systemPromptFor(exerciseContext);

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

Based on all available information above, create a clean exercise name and full metadata appropriate for ${exerciseContext === "CLINICAL" ? "senior rehabilitation clients" : "athletic/general-fitness clients"}. Prioritise the transcript and description for accurate instructions and details — use the title primarily for the exercise name.`,
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

Provide practical, evidence-based metadata ${exerciseContext === "CLINICAL" ? "a physical therapist would give their senior clients" : "a strength & conditioning coach would give athletic/general-fitness clients"}.`,
    });

    return NextResponse.json({ success: true, data: object });
  } catch (error) {
    console.error("Failed to generate exercise metadata:", error);
    return NextResponse.json({ error: "Failed to generate metadata" }, { status: 500 });
  }
}
