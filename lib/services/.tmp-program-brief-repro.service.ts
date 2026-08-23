import OpenAI from "openai";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
function normalizeExerciseName(name) {
  return name.toLowerCase().replace(/https?:\/\/\S+/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ALLOWED_DIFFICULTY = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;

const ALLOWED_CIRCUIT_FOCUS = [
  "WARMUP",
  "LOWER_BODY",
  "UPPER_BODY",
  "CORE",
  "FULL_BODY",
  "BALANCE",
  "FLEXIBILITY",
  "COOLDOWN",
  "CARDIO",
] as const;

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

type CircuitConfig = {
  name: string;
  focusType: string;
  exerciseCount: number;
  rounds?: number;
};

export type ExerciseBlueprint = {
  name: string;
  sets?: number;
  reps?: number;
  durationSeconds?: number;
  notes?: string;
  traceableInDocument?: boolean;
};

export type BlockBlueprint = {
  name: string;
  focusType: string;
  exercises: ExerciseBlueprint[];
};

export type SessionBlueprint = {
  dayIndex: number;
  weekIndex?: number;
  title: string;
  blocks: BlockBlueprint[];
  sourceChunkIndex?: number;
  // Verbatim day label from extraction (e.g. "Monday"), when the excerpt
  // stated one — lets downstream day-of-week assignment use the document's
  // own weekday instead of counting position within the week, which drifts
  // as soon as any session in the middle of the week gets dropped (e.g. an
  // unresolvable "same exercises as Week 1" reference).
  dayLabel?: string | null;
};

const WEEKDAY_NAME_TO_INDEX: Record<string, number> = {
  monday: 0, mon: 0,
  tuesday: 1, tue: 1, tues: 1,
  wednesday: 2, wed: 2,
  thursday: 3, thu: 3, thur: 3, thurs: 3,
  friday: 4, fri: 4,
  saturday: 5, sat: 5,
  sunday: 6, sun: 6,
};

/**
 * Resolves a verbatim dayLabel (e.g. "Monday", "Mon", "Day 1") to an absolute
 * weekday index (0=Monday..6=Sunday), or null if it doesn't name a real
 * weekday (e.g. "Day 1", "Session A", or nothing at all).
 */
export function parseWeekdayFromLabel(label: string | null | undefined): number | null {
  if (!label) return null;
  const normalized = label.toLowerCase().trim().replace(/[^a-z]/g, "");
  return WEEKDAY_NAME_TO_INDEX[normalized] ?? null;
}

export type RawSession = {
  weekLabel: string | null;
  dayLabel: string | null;
  title: string;
  blocks: BlockBlueprint[];
  sourceChunkIndex?: number;
};

export type ChunkExtractionResult = {
  sessions: RawSession[];
  warnings: string[];
};

export type ProgramBriefParsed = {
  programTitle: string;
  focusAreas: string[];
  difficultyLevel: string;
  durationMinutes: number;
  daysPerWeek: number;
  preferredWeekdays: string[];
  circuits: CircuitConfig[];
  sessionBlueprint?: SessionBlueprint[];
  warnings?: string[];
  // Which of the fields above were not explicitly stated in the document and
  // had to be inferred — the trainer-facing preview uses this to highlight
  // those specific fields as editable, rather than a generic text warning.
  inferredFields?: string[];
};

export type ProgramBriefParseResult =
  | { ok: true; data: ProgramBriefParsed }
  | { ok: false; errors: string[] };

function normalizeText(raw: string) {
  return raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

const CHUNK_SIZE_CEILING = 8000; // characters — keeps each AI extraction call comfortably small
// When no "Week N"-style boundary exists at all, the whole document becomes a
// single group that gets sliced purely by size — each slice can end up
// carrying many dense, near-duplicate sessions for one AI call to extract at
// once, which is measurably less reliable (observed: an unlabeled, highly
// repetitive document silently dropped several leading sessions at the
// default ceiling, reproducibly, even at temperature 0). Use a smaller
// ceiling here so no single call has to carry as much.
const NO_BOUNDARY_CHUNK_SIZE_CEILING = 3000;

export function splitIntoChunks(text: string): string[] {
  const paragraphs = normalizeText(text)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (!paragraphs.length) return [];

  // Broad section-boundary heuristic: "Week 1", "Phase 2", "Cycle 3", etc.
  // This is a splitting hint only — it never has to be exhaustive, because the
  // per-chunk AI extraction (Task 5) is what actually identifies sessions.
  const boundaryPattern = /^(week|phase|month|cycle|block)\s+\d+/i;
  const boundaryIndices = paragraphs.reduce<number[]>((acc, p, i) => {
    if (boundaryPattern.test(p)) acc.push(i);
    return acc;
  }, []);

  let groups: string[][];
  let sizeCeiling = CHUNK_SIZE_CEILING;
  if (boundaryIndices.length >= 2) {
    groups = [];
    if (boundaryIndices[0] > 0) {
      groups.push(paragraphs.slice(0, boundaryIndices[0]));
    }
    for (let g = 0; g < boundaryIndices.length; g++) {
      const start = boundaryIndices[g];
      const end = g + 1 < boundaryIndices.length ? boundaryIndices[g + 1] : paragraphs.length;
      groups.push(paragraphs.slice(start, end));
    }
  } else {
    // No reliable section boundaries — treat the whole document as one group,
    // then let the (smaller) size ceiling below break it into paragraph-aligned chunks.
    groups = [paragraphs];
    sizeCeiling = NO_BOUNDARY_CHUNK_SIZE_CEILING;
  }

  const chunks: string[] = [];
  for (const group of groups) {
    let current: string[] = [];
    let currentSize = 0;
    for (const para of group) {
      // Calculate size if we add this paragraph (including separator overhead)
      const separatorSize = current.length > 0 ? 2 : 0;
      const potentialSize = currentSize + separatorSize + para.length;

      if (potentialSize > sizeCeiling && current.length) {
        chunks.push(current.join('\n\n'));
        current = [];
        currentSize = 0;
      }

      current.push(para);
      if (current.length === 1) {
        currentSize = para.length;
      } else {
        currentSize += 2 + para.length;
      }
    }
    if (current.length) chunks.push(current.join('\n\n'));
  }
  return chunks;
}

export function mergeChunkSessions(
  chunkResults: ChunkExtractionResult[],
  fallbackDaysPerWeek: number
): {
  sessionBlueprint: SessionBlueprint[];
  daysPerWeek: number;
  warnings: string[];
} {
  const flatSessions = chunkResults.flatMap((c) => c.sessions);
  const warnings = chunkResults.flatMap((c) => c.warnings);

  if (!flatSessions.length) {
    return { sessionBlueprint: [], daysPerWeek: 1, warnings };
  }

  // Carry the last explicit weekLabel forward onto undecorated sessions — many
  // real documents state "Week 2" once and don't repeat it for every day under it.
  let lastWeekLabel: string | null = null;
  const withCarriedLabel = flatSessions.map((s) => {
    if (s.weekLabel) lastWeekLabel = s.weekLabel;
    return { ...s, weekLabel: s.weekLabel ?? lastWeekLabel };
  });

  const hasAnyWeekLabel = withCarriedLabel.some((s) => s.weekLabel !== null);

  // When nothing in the document ever states a week boundary — e.g. a program
  // that just cycles through named sessions ("Lower body A", "Upper body A",
  // "Full body A", "Lower body B", ...) for many weeks with no numbering at all —
  // there is no label to group by. Falling back to "one giant week" here would
  // let daysPerWeek grow past 7, which later collides distinct sessions onto the
  // same weekday slot. Instead, group into fixed-size weeks using the AI's
  // holistic estimate of this program's actual training days/week.
  const perWeek = Math.max(1, Math.min(7, Math.round(fallbackDaysPerWeek) || 1));

  const sessionBlueprint: SessionBlueprint[] = [];
  let weekIndex = 0;
  let dayIndex = 0;
  let currentLabel: string | null = null;
  let seenFirst = false;

  withCarriedLabel.forEach((s, i) => {
    if (hasAnyWeekLabel) {
      if (!seenFirst || s.weekLabel !== currentLabel) {
        if (seenFirst) weekIndex += 1;
        currentLabel = s.weekLabel;
        dayIndex = 0;
        seenFirst = true;
      }
      sessionBlueprint.push({ dayIndex, weekIndex, title: s.title, blocks: s.blocks, sourceChunkIndex: s.sourceChunkIndex, dayLabel: s.dayLabel });
      dayIndex += 1;
    } else {
      sessionBlueprint.push({
        dayIndex: i % perWeek,
        weekIndex: Math.floor(i / perWeek),
        title: s.title,
        blocks: s.blocks,
        sourceChunkIndex: s.sourceChunkIndex,
        dayLabel: s.dayLabel,
      });
    }
  });

  const perWeekCount = new Map<number, number>();
  for (const s of sessionBlueprint) {
    const w = s.weekIndex ?? 0;
    perWeekCount.set(w, (perWeekCount.get(w) ?? 0) + 1);
  }
  const daysPerWeek = Math.max(1, ...Array.from(perWeekCount.values()));

  return { sessionBlueprint, daysPerWeek, warnings };
}

export function deriveCircuitsFromSessions(sessions: SessionBlueprint[]): CircuitConfig[] {
  const byName = new Map<string, { focusType: string; exerciseCount: number }>();
  for (const session of sessions) {
    for (const block of session.blocks) {
      const existing = byName.get(block.name);
      const count = block.exercises.length;
      if (!existing) {
        byName.set(block.name, { focusType: block.focusType, exerciseCount: count });
      } else if (count > existing.exerciseCount) {
        existing.exerciseCount = count;
      }
    }
  }
  return Array.from(byName.entries()).map(([name, { focusType, exerciseCount }]) => ({
    name,
    focusType,
    exerciseCount,
    rounds: focusType === 'WARMUP' || focusType === 'COOLDOWN' ? 1 : 3,
  }));
}

/**
 * Checks whether an extracted exercise name is actually traceable back to the
 * chunk of source text it was extracted from — a guard against the extraction
 * LLM inventing an exercise the document never mentioned.
 */
export function isExerciseTraceableInDocument(exerciseName: string, sourceText: string): boolean {
  const normalizedName = normalizeExerciseName(exerciseName);
  if (!normalizedName) return true;

  const normalizedSource = normalizeExerciseName(sourceText);
  if (normalizedSource.includes(normalizedName)) return true;

  // Fall back to token overlap for names the model paraphrased slightly
  // (e.g. "DB" expanded to "Dumbbell") — require most of the exercise name's
  // distinctive (length > 2) tokens to appear somewhere in the source chunk.
  const nameTokens = normalizedName.split(" ").filter((t) => t.length > 2);
  if (!nameTokens.length) return true;

  const sourceTokens = new Set(normalizedSource.split(" "));
  const matched = nameTokens.filter((t) => sourceTokens.has(t)).length;
  return matched / nameTokens.length >= 0.6;
}

/**
 * Sets `traceableInDocument` on every exercise in the blueprint by checking it
 * against the raw text of the chunk it was extracted from.
 */
export function flagUntraceableExercises(
  sessionBlueprint: SessionBlueprint[],
  chunks: string[]
): SessionBlueprint[] {
  return sessionBlueprint.map((session) => {
    const sourceText =
      session.sourceChunkIndex != null ? (chunks[session.sourceChunkIndex] ?? "") : "";
    return {
      ...session,
      blocks: session.blocks.map((block) => ({
        ...block,
        exercises: block.exercises.map((exercise) => ({
          ...exercise,
          traceableInDocument: sourceText ? isExerciseTraceableInDocument(exercise.name, sourceText) : true,
        })),
      })),
    };
  });
}

/**
 * Defense-in-depth against the extraction LLM fabricating an entire session
 * (e.g. from a title page or a "programming guidelines" excerpt that merely
 * describes session structure without naming exercises) rather than genuinely
 * paraphrasing real content: a real, imperfectly-paraphrased session almost
 * never has EVERY exercise fail the traceability check (isExerciseTraceableInDocument
 * already tolerates paraphrasing via token overlap) — so a session where 100%
 * of exercises are untraceable is treated as invented and dropped, rather than
 * being merged in as if it were a real day that merely needs per-exercise review.
 */
export function dropFabricatedSessions(
  sessionBlueprint: SessionBlueprint[]
): { sessions: SessionBlueprint[]; warnings: string[] } {
  const warnings: string[] = [];
  const sessions = sessionBlueprint.filter((session) => {
    const allExercises = session.blocks.flatMap((b) => b.exercises);
    if (!allExercises.length) return true;
    const allUntraceable = allExercises.every((e) => e.traceableInDocument === false);
    if (allUntraceable) {
      warnings.push(
        `A session ("${session.title}") could not be matched to any content in the document and was removed automatically — please check that part of the document manually if a session is missing.`
      );
      return false;
    }
    return true;
  });
  return { sessions, warnings };
}

/**
 * Re-assigns weekIndex/dayIndex to be contiguous, 0-based sequences after
 * sessions have been filtered out — otherwise a dropped session leaves a gap
 * (e.g. day indices 3,4,5 surviving in a week while other weeks start at 0).
 */
export function renumberSessions(sessionBlueprint: SessionBlueprint[]): SessionBlueprint[] {
  const byWeek = new Map<number, SessionBlueprint[]>();
  for (const session of sessionBlueprint) {
    const week = session.weekIndex ?? 0;
    if (!byWeek.has(week)) byWeek.set(week, []);
    byWeek.get(week)!.push(session);
  }
  const orderedWeeks = Array.from(byWeek.keys()).sort((a, b) => a - b);
  const result: SessionBlueprint[] = [];
  orderedWeeks.forEach((week, weekPosition) => {
    byWeek.get(week)!.forEach((session, dayPosition) => {
      result.push({ ...session, weekIndex: weekPosition, dayIndex: dayPosition });
    });
  });
  return result;
}

export type BriefMetadata = {
  programTitle: string;
  focusAreas: string[];
  difficultyLevel: string;
  durationMinutes: number;
  preferredWeekdays: string[];
  estimatedDaysPerWeek: number;
  inferredFields: string[];
};

const BRIEF_METADATA_SCHEMA = {
  name: 'brief_metadata',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      programTitle: { type: 'string' },
      focusAreas: { type: 'array', items: { type: 'string' } },
      difficultyLevel: { type: 'string', enum: [...ALLOWED_DIFFICULTY] },
      durationMinutes: { type: 'number' },
      preferredWeekdays: { type: 'array', items: { type: 'string', enum: [...WEEKDAYS] } },
      estimatedDaysPerWeek: { type: 'number' },
      inferredFields: { type: 'array', items: { type: 'string' } },
    },
    required: [
      'programTitle',
      'focusAreas',
      'difficultyLevel',
      'durationMinutes',
      'preferredWeekdays',
      'estimatedDaysPerWeek',
      'inferredFields',
    ],
  },
} as const;

export async function extractBriefMetadata(text: string): Promise<BriefMetadata> {
  const systemPrompt = `You extract high-level program metadata from an uploaded training/exercise program document. The document may be for any context — rehabilitation, athletic performance, strength & conditioning, general fitness — and may use any structure, formatting, or terminology.

Return:
- programTitle: the program's name/title.
- focusAreas: 2-5 short focus area terms (e.g. "lower body", "power", "core").
- difficultyLevel: BEGINNER, INTERMEDIATE, or ADVANCED.
- durationMinutes: typical session length in minutes.
- preferredWeekdays: which weekdays training happens on. If not explicitly stated, choose a sensible default set matching the number of training days per week you can infer from the document.
- estimatedDaysPerWeek: how many distinct training days per week this program actually uses, as a whole number 1-7. Read the ENTIRE document to judge this holistically — if it has explicit "Week N" sections, use the typical number of sessions per week. If it has NO week numbering at all but repeats a cycle of named sessions (e.g. "Lower body A", "Upper body A", "Full body A", then "Lower body B", "Upper body B", "Full body B", then the cycle repeats with new focus variants), count the sessions in one cycle before it repeats or restarts — that is the days/week. This number matters even when it can't be stated explicitly elsewhere, since it's used to correctly split a many-session document into multiple weeks instead of one.
- inferredFields: the field names above that were NOT explicitly stated in the document and had to be inferred. Leave empty if everything was explicit.

Never invent specific exercises here — only these fields.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 1000,
    temperature: 0,
    response_format: { type: 'json_schema', json_schema: BRIEF_METADATA_SCHEMA },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text },
    ],
  });

  const raw = response.choices[0].message.content ?? '{}';
  const parsed = JSON.parse(raw) as BriefMetadata;
  return {
    ...parsed,
    durationMinutes: Math.min(180, Math.max(10, parsed.durationMinutes || 45)),
    estimatedDaysPerWeek: Math.min(7, Math.max(1, Math.round(parsed.estimatedDaysPerWeek) || 3)),
  };
}

const CHUNK_EXTRACTION_SCHEMA = {
  name: 'chunk_extraction',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      sessions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            weekLabel: { type: ['string', 'null'] },
            dayLabel: { type: ['string', 'null'] },
            title: { type: 'string' },
            blocks: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  name: { type: 'string' },
                  focusType: { type: 'string', enum: [...ALLOWED_CIRCUIT_FOCUS] },
                  exercises: {
                    type: 'array',
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        name: { type: 'string' },
                        sets: { type: ['number', 'null'] },
                        reps: { type: ['number', 'null'] },
                        durationSeconds: { type: ['number', 'null'] },
                        notes: { type: ['string', 'null'] },
                      },
                      required: ['name', 'sets', 'reps', 'durationSeconds', 'notes'],
                    },
                  },
                },
                required: ['name', 'focusType', 'exercises'],
              },
            },
          },
          required: ['weekLabel', 'dayLabel', 'title', 'blocks'],
        },
      },
      warnings: { type: 'array', items: { type: 'string' } },
    },
    required: ['sessions', 'warnings'],
  },
} as const;

export async function extractChunkSessions(
  chunk: string,
  chunkIndex: number,
  totalChunks: number,
  continuityNote: string | null
): Promise<ChunkExtractionResult> {
  const systemPrompt = `You extract every distinct training session from an excerpt of a program document. The document may use any structure or terminology — tables, bullets, numbered lists, prose, or a fixed template.

Rules:
- Extract every session in this excerpt, in the exact order they appear. Do not skip or merge sessions.
- Every exercise you output MUST be copied from an actual exercise name written in this excerpt. Never invent, guess, or supply a "typical"/"placeholder"/"example" exercise for a session, even if the excerpt describes what a session generally contains (e.g. "each session: 4-exercise warm-up, 4-exercise main circuit, 3-exercise cool-down") without actually naming exercises there. A description of session structure is not a session.
- If this excerpt contains no session with actual named exercises — e.g. it is only a title page, table of contents, equipment list, or general programming guidelines — return an empty "sessions" array. Returning nothing is correct and expected for excerpts like that.
- Some sessions in this excerpt may be genuinely extractable (they name real exercises) while others in the SAME excerpt are not (e.g. "Monday: same exercises as Week 1, but 2 sets" never restates what those exercises are). Handle each session independently — extract the ones with real named content even if a sibling session in the same excerpt has to be skipped. Do not discard the whole excerpt just because one session in it can't be resolved.
- For each session capture: weekLabel (verbatim label like "Week 1" or "Deload Week" if the excerpt states one for this session, else null), dayLabel (verbatim label like "Day 1" or "Monday" if stated, else null), title (the session's descriptive name), and blocks.
- Each block is a named section of the session (e.g. "Warm Up", "Strength Block A", "Accessory") containing an ordered list of exercises. Use the document's own section names — do not rename them.
- Classify each block's focusType as the closest match among: ${ALLOWED_CIRCUIT_FOCUS.join(', ')}.
- For each exercise capture: name (exact name from the document, no bullet markers), sets, reps, durationSeconds (for holds/timed work, instead of reps), and notes. Use null for anything not explicitly stated — never invent numbers.
- Do not include rest-period lines (e.g. "Rest: 45 sec") as exercises.
- A day described only by distance/pace/duration (e.g. "5 miles easy", "3 mi easy + 4 x 15-sec strides", "20-min shakeout jog") IS a valid, extractable session even though it names no traditional resistance exercise — it always has real, specific content of its own (a distance, a pace, a duration), never a cross-reference to another day. Treat the activity description itself as a single exercise entry (name = the description as written, e.g. "5 miles easy"; put any distance/duration in notes or durationSeconds if a clear number is given, reps/sets null). Extract it as its own session — do not omit it just because it isn't a named strength exercise.
- A session that only refers back to another day/week without restating any exercise names (e.g. "same exercises as Week 1, 2 sets") has no session of its own to extract here — omit it and add a warning naming the day/week and what it referenced, instead of silently dropping it. Do not let one unresolvable session cause you to skip other sessions in this excerpt that ARE fully named, including the distance/pace/duration sessions above.
- Add an entry to "warnings" for anything else ambiguous you had to guess at.

This is chunk ${chunkIndex + 1} of ${totalChunks}.${continuityNote ? ` ${continuityNote}` : ''} Continue any week/day numbering from where the previous chunk left off — do not restart it unless the document itself restarts it.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    // A chunk can hold a dozen+ sessions once every exercise's sets/reps/notes
    // are spelled out in full (strict JSON schema requires every property
    // present, even when null). 4000 was too small and silently truncated
    // mid-response for chunks with many sessions — raised close to gpt-4o's
    // 16,384-token output ceiling so a full chunk's worth of sessions fits.
    max_tokens: 16000,
    temperature: 0,
    response_format: { type: 'json_schema', json_schema: CHUNK_EXTRACTION_SCHEMA },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: chunk },
    ],
  });

  if (response.choices[0].finish_reason === 'length') {
    throw new Error(`extractChunkSessions: response truncated at the token limit for chunk ${chunkIndex + 1} of ${totalChunks}`);
  }

  const raw = response.choices[0].message.content;
  if (!raw) return { sessions: [], warnings: [] };
  return JSON.parse(raw) as ChunkExtractionResult;
}

export async function extractProgramBriefText(fileUrl: string, fileName: string) {
  const res = await fetch(fileUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch file: ${res.status}`);
  }

  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".pdf")) {
    const buffer = Buffer.from(await res.arrayBuffer());
    const parsed = await pdfParse(buffer);
    return parsed.text || "";
  }

  if (lowerName.endsWith(".docx")) {
    const buffer = Buffer.from(await res.arrayBuffer());
    // mammoth's extractRawText drops soft line breaks (<w:br/>) entirely, which
    // collapses Word bullet lists authored with Shift+Enter into one unparseable
    // line. Convert to HTML first so <br> and block tags can be turned into real
    // newlines before stripping markup.
    const converted = await mammoth.convertToHtml({ buffer });
    return htmlToPlainText(converted.value || "");
  }

  return await res.text();
}

function tableRowToLine(rowHtml: string): string {
  const cells = [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(([, cellHtml]) =>
    cellHtml
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
  return cells.filter(Boolean).join(" | ");
}

// Converts each <table> into one line of text per row (cells joined with " | ")
// instead of letting the generic paragraph-per-tag conversion below explode
// every <td> into its own standalone paragraph. That fragmentation is more
// than a formatting nicety: a bare header cell like <td><p>Week 1</p></td> —
// completely ordinary in a "week-by-week overview" summary table — becomes
// an isolated one-line paragraph that reads exactly like a real "Week 1"
// section heading, and splitIntoChunks' section-boundary heuristic can't
// tell the difference. Keeping the row intact ("Day | Week 1 | Week 2 | ...")
// means a bare label never appears on its own.
// A table whose header row names 2+ different weeks (e.g. "Day | Week 1 |
// Week 2 | Week 3 | Week 4") is a week-by-week AT-A-GLANCE OVERVIEW grid —
// every cell in it is a one- or two-word summary of a day that gets spelled
// out in full detail in its own real section later in the document. It is
// never itself a source of real sessions; including it only gives the
// extraction model a second, ambiguous, easy-to-misread copy of the same
// information (its rows read exactly like real "Tuesday: 5 mi easy"-style
// day entries once flattened, especially once the model is told a bare
// distance/pace description can be a whole session on its own).
function isWeekOverviewGrid(headerRowHtml: string): boolean {
  const headerText = tableRowToLine(headerRowHtml);
  const weekMatches = headerText.match(/\bweek\s+\d+\b/gi) ?? [];
  return new Set(weekMatches.map((m) => m.toLowerCase())).size >= 2;
}

function flattenTables(html: string): string {
  return html.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_match, tableInner: string) => {
    const rowMatches = [...tableInner.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    if (rowMatches.length && isWeekOverviewGrid(rowMatches[0][1])) {
      return "\n\n";
    }
    const rows = rowMatches.map(([, rowHtml]) => tableRowToLine(rowHtml)).filter(Boolean);
    return `\n\n${rows.join("\n")}\n\n`;
  });
}

function htmlToPlainText(html: string): string {
  return flattenTables(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h[1-6]|li|div)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const MAX_CONCURRENT_CHUNKS = 4;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function sessionSummary(s: RawSession): string {
  return `${s.weekLabel ?? 'no week label'}, ${s.dayLabel ?? s.title}`;
}

const CHUNK_BOUNDARY_LABEL_PATTERN = /^((?:week|phase|month|cycle|block)\s+\d+)/i;

/**
 * Deterministically reads the week/phase label straight from a chunk's own
 * leading text, when that chunk starts at one of splitIntoChunks' boundary
 * matches (e.g. a chunk beginning "Week 2 — Reduce Volume..."). Every session
 * extracted from a chunk that has one of these gets stamped with THIS label,
 * overriding whatever weekLabel the extraction LLM assigned per-session.
 *
 * This matters because mergeChunkSessions groups purely by weekLabel string
 * equality across the whole flat session list — if the model tags the label
 * inconsistently from one session to the next within the same chunk (observed:
 * asking it to be more liberal about extracting borderline "sessions" like a
 * plain running day made this worse), that inconsistency fractures a single
 * real week into multiple phantom week groups. Since we already know which
 * chunk maps to which week (that's exactly how splitIntoChunks split them),
 * there's no reason to trust the model's per-session echo of that same fact.
 */
function extractChunkBoundaryLabel(chunkText: string): string | null {
  const firstLine = chunkText.split('\n')[0]?.trim() ?? '';
  const match = firstLine.match(CHUNK_BOUNDARY_LABEL_PATTERN);
  return match ? match[1] : null;
}

export async function parseProgramBrief(
  text: string,
  // Schedule (days/week, weekdays) actually gets baked into the generated
  // program's day assignments during generation — editing it after the fact
  // wouldn't move anything. So when it can't be read from the document, the
  // trainer confirms it up front (see extractProgramMetadataFromBriefAction),
  // and that confirmed metadata is passed in here instead of re-guessing.
  metadataOverride?: BriefMetadata
): Promise<ProgramBriefParseResult> {
  if (!text.trim()) {
    return { ok: false, errors: ['The document appears to be empty or unreadable.'] };
  }

  const metadata = metadataOverride ?? (await extractBriefMetadata(text));
  const chunks = splitIntoChunks(text);

  if (!chunks.length) {
    return { ok: false, errors: ['No content could be extracted from this document.'] };
  }

  // Cost-visibility signal only — no cap on chunk count per the "no size limit" requirement.
  if (chunks.length > 40) {
    console.warn(`[program-brief] Unusually large document: ${chunks.length} chunks to process.`);
  }

  // Best-effort continuity hint for chunk N+1 — chunks run concurrently, so this
  // may occasionally reflect a different chunk's completion order than strict
  // document order. That's acceptable: correctness comes from mergeChunkSessions'
  // weekLabel-based grouping, not from this hint.
  let lastSessionNote: string | null = null;
  const chunkResults = await mapWithConcurrency(chunks, MAX_CONCURRENT_CHUNKS, async (chunk, index) => {
    const continuityNote = lastSessionNote
      ? `The previous chunk's last session was: ${lastSessionNote}.`
      : null;
    const boundaryLabel = extractChunkBoundaryLabel(chunk);
    const tagWithChunk = (result: ChunkExtractionResult): ChunkExtractionResult => ({
      ...result,
      sessions: result.sessions.map((s) => ({
        ...s,
        sourceChunkIndex: index,
        weekLabel: boundaryLabel ?? s.weekLabel,
      })),
    });
    try {
      const result = await extractChunkSessions(chunk, index, chunks.length, continuityNote);
      if (result.sessions.length) {
        lastSessionNote = sessionSummary(result.sessions[result.sessions.length - 1]);
      }
      return tagWithChunk(result);
    } catch {
      try {
        return tagWithChunk(await extractChunkSessions(chunk, index, chunks.length, continuityNote));
      } catch {
        return {
          sessions: [],
          warnings: [
            `Couldn't parse part of the document (section ${index + 1} of ${chunks.length}) — please review that section manually.`,
          ],
        };
      }
    }
  });

  const { sessionBlueprint, warnings: chunkWarnings } = mergeChunkSessions(
    chunkResults,
    metadata.estimatedDaysPerWeek
  );

  if (!sessionBlueprint.length) {
    return { ok: false, errors: ['No training sessions could be found in this document.'] };
  }

  const flaggedSessionBlueprint = flagUntraceableExercises(sessionBlueprint, chunks);
  const { sessions: fabricationFilteredBlueprint, warnings: fabricationWarnings } =
    dropFabricatedSessions(flaggedSessionBlueprint);

  if (!fabricationFilteredBlueprint.length) {
    return {
      ok: false,
      errors: [
        'Every session extracted from this document failed verification against the source text — this usually means the document has an unusual layout the parser could not read. Please check the file and try again.',
      ],
    };
  }

  const finalSessionBlueprint = renumberSessions(fabricationFilteredBlueprint);

  const perWeekCount = new Map<number, number>();
  for (const s of finalSessionBlueprint) {
    const w = s.weekIndex ?? 0;
    perWeekCount.set(w, (perWeekCount.get(w) ?? 0) + 1);
  }
  const daysPerWeek = Math.max(1, ...Array.from(perWeekCount.values()));

  const circuits = deriveCircuitsFromSessions(finalSessionBlueprint);

  let preferredWeekdays = metadata.preferredWeekdays.length
    ? [...metadata.preferredWeekdays]
    : WEEKDAYS.slice(0, daysPerWeek);

  if (preferredWeekdays.length !== daysPerWeek) {
    if (preferredWeekdays.length > daysPerWeek) {
      preferredWeekdays = preferredWeekdays.slice(0, daysPerWeek);
    } else {
      const existing = new Set(preferredWeekdays);
      for (const day of WEEKDAYS) {
        if (preferredWeekdays.length >= daysPerWeek) break;
        if (!existing.has(day)) preferredWeekdays.push(day);
      }
    }
  }

  return {
    ok: true,
    data: {
      programTitle: metadata.programTitle || finalSessionBlueprint[0].title,
      focusAreas: metadata.focusAreas,
      difficultyLevel: metadata.difficultyLevel,
      durationMinutes: metadata.durationMinutes,
      daysPerWeek,
      preferredWeekdays,
      circuits,
      sessionBlueprint: finalSessionBlueprint,
      warnings: [...chunkWarnings, ...fabricationWarnings],
      inferredFields: metadata.inferredFields,
    },
  };
}

