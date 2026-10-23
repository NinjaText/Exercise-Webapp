import type { ReflectionKind, ReflectionTheme } from "./constants";
import { utcDaysBetween } from "./dates";

/**
 * Built-in reflection library: the trainer's "Prompt library" in the Create
 * flow, and the client dashboard's fallback so Today's Reflection is never
 * empty.
 *
 * Attribution policy: almost everything here is original and unattributed.
 * A quote only carries an author when the attribution is well established in
 * a primary source (a published book, poem or recorded talk). Popular
 * internet attributions (the "Einstein said…" kind) are deliberately left out.
 * Proverbs are labelled as proverbs, not pinned to a person.
 */
export interface LibraryReflection {
  id: string;
  kind: ReflectionKind;
  text: string;
  author?: string;
  theme: ReflectionTheme;
}

export const REFLECTION_LIBRARY: readonly LibraryReflection[] = [
  // ─── Consistency ───────────────────────────────────────────────────────────
  { id: "consistency-01", kind: "QUESTION", theme: "Consistency", text: "What is one small thing you did today that your future self will thank you for?" },
  { id: "consistency-02", kind: "PROMPT", theme: "Consistency", text: "Describe a routine that felt hard a month ago and feels easier now. What changed?" },
  { id: "consistency-03", kind: "QUOTE", theme: "Consistency", text: "Fall seven times, stand up eight.", author: "Japanese proverb" },
  { id: "consistency-04", kind: "QUESTION", theme: "Consistency", text: "On the days you nearly skipped but didn't, what got you moving?" },
  { id: "consistency-05", kind: "QUOTE", theme: "Consistency", text: "Showing up on an ordinary day is how extraordinary results are built." },
  { id: "consistency-06", kind: "PROMPT", theme: "Consistency", text: "Write down the minimum version of your routine — the one you could do even on your busiest day." },
  { id: "consistency-07", kind: "QUESTION", theme: "Consistency", text: "Which part of your week makes it hardest to stay on track, and what could make it 10% easier?" },
  { id: "consistency-08", kind: "QUOTE", theme: "Consistency", text: "Be not afraid of going slowly; be afraid only of standing still.", author: "Chinese proverb" },

  // ─── Mindset ───────────────────────────────────────────────────────────────
  { id: "mindset-01", kind: "QUESTION", theme: "Mindset", text: "What story are you telling yourself about your progress, and is it actually true?" },
  { id: "mindset-02", kind: "PROMPT", theme: "Mindset", text: "Think of a recent setback. Write how you would talk about it to a friend in the same situation." },
  { id: "mindset-03", kind: "QUOTE", theme: "Mindset", text: "The best way out is always through.", author: "Robert Frost" },
  { id: "mindset-04", kind: "QUESTION", theme: "Mindset", text: "What would you attempt this week if you weren't worried about doing it perfectly?" },
  { id: "mindset-05", kind: "QUOTE", theme: "Mindset", text: "Your body keeps a quiet record of every time you chose to try." },
  { id: "mindset-06", kind: "PROMPT", theme: "Mindset", text: "List three things you can control today and one thing you are choosing to let go of." },
  { id: "mindset-07", kind: "QUESTION", theme: "Mindset", text: "When did you last surprise yourself with what you could do?" },
  { id: "mindset-08", kind: "PROMPT", theme: "Mindset", text: "Finish this sentence three different ways: \"I am becoming someone who…\"" },

  // ─── Recovery ──────────────────────────────────────────────────────────────
  { id: "recovery-01", kind: "QUESTION", theme: "Recovery", text: "How did you sleep last night, and what is one thing that could help you rest better tonight?" },
  {
    id: "recovery-02",
    kind: "QUOTE",
    theme: "Recovery",
    text: "Rest is not idleness, and to lie sometimes on the grass under trees on a summer's day, listening to the murmur of the water, or watching the clouds float across the blue sky, is by no means a waste of time.",
    author: "John Lubbock",
  },
  { id: "recovery-03", kind: "PROMPT", theme: "Recovery", text: "Scan your body from head to toe. Where do you feel tension, and where do you feel good?" },
  { id: "recovery-04", kind: "QUESTION", theme: "Recovery", text: "What does a genuinely restful day look like for you?" },
  { id: "recovery-05", kind: "QUOTE", theme: "Recovery", text: "Almost everything will work again if you unplug it for a few minutes, including you.", author: "Anne Lamott" },
  { id: "recovery-06", kind: "PROMPT", theme: "Recovery", text: "Write about a moment today when you slowed down on purpose. How did it feel?" },
  { id: "recovery-07", kind: "QUESTION", theme: "Recovery", text: "Is your body asking for more effort or more rest this week? How can you tell?" },

  // ─── Gratitude ─────────────────────────────────────────────────────────────
  { id: "gratitude-01", kind: "PROMPT", theme: "Gratitude", text: "Name three things your body let you do today that you are grateful for." },
  { id: "gratitude-02", kind: "QUESTION", theme: "Gratitude", text: "Who has supported your health journey recently, and have you told them?" },
  { id: "gratitude-03", kind: "QUOTE", theme: "Gratitude", text: "Gratitude turns what we have into enough — and what we do into progress." },
  { id: "gratitude-04", kind: "PROMPT", theme: "Gratitude", text: "Write about a small, ordinary moment from today that you would like to remember." },
  { id: "gratitude-05", kind: "QUESTION", theme: "Gratitude", text: "What is something you can do now that you couldn't do a year ago?" },
  { id: "gratitude-06", kind: "PROMPT", theme: "Gratitude", text: "Thank one part of your body for the work it does, and write why." },
  { id: "gratitude-07", kind: "QUESTION", theme: "Gratitude", text: "Which habit are you most glad you started?" },

  // ─── Discipline ────────────────────────────────────────────────────────────
  { id: "discipline-01", kind: "QUESTION", theme: "Discipline", text: "What is the one thing you will do today even if you don't feel like it?" },
  { id: "discipline-02", kind: "QUOTE", theme: "Discipline", text: "Motivation gets you started. Systems keep you going when it fades." },
  { id: "discipline-03", kind: "PROMPT", theme: "Discipline", text: "Pick one distraction that pulls you off track. Write a plan for the next time it shows up." },
  { id: "discipline-04", kind: "QUESTION", theme: "Discipline", text: "What promise to yourself are you keeping right now?" },
  { id: "discipline-05", kind: "QUOTE", theme: "Discipline", text: "A journey of a thousand miles begins with a single step.", author: "Lao Tzu" },
  { id: "discipline-06", kind: "PROMPT", theme: "Discipline", text: "Describe tomorrow morning in detail, from waking up to your first healthy choice." },
  { id: "discipline-07", kind: "QUESTION", theme: "Discipline", text: "Where are you relying on willpower when a simple plan would do the job?" },

  // ─── Self-care ─────────────────────────────────────────────────────────────
  {
    id: "selfcare-01",
    kind: "QUOTE",
    theme: "Self-care",
    text: "Caring for myself is not self-indulgence, it is self-preservation, and that is an act of political warfare.",
    author: "Audre Lorde",
  },
  { id: "selfcare-02", kind: "QUESTION", theme: "Self-care", text: "What do you need more of this week — movement, rest, connection or quiet?" },
  { id: "selfcare-03", kind: "PROMPT", theme: "Self-care", text: "Write a short, kind note to yourself as if from someone who believes in you." },
  { id: "selfcare-04", kind: "QUESTION", theme: "Self-care", text: "What is one boundary that would protect your energy this week?" },
  { id: "selfcare-05", kind: "QUOTE", theme: "Self-care", text: "Taking care of yourself is part of the work, not a break from it." },
  { id: "selfcare-06", kind: "PROMPT", theme: "Self-care", text: "List five things that reliably lift your mood in under ten minutes." },
  { id: "selfcare-07", kind: "QUESTION", theme: "Self-care", text: "How are you feeling right now, honestly — and what would help?" },

  // ─── Progress ──────────────────────────────────────────────────────────────
  { id: "progress-01", kind: "PROMPT", theme: "Progress", text: "Look back at where you started. Write down three ways you have changed since then." },
  { id: "progress-02", kind: "QUESTION", theme: "Progress", text: "What is a win from this week that nobody else noticed?" },
  { id: "progress-03", kind: "QUOTE", theme: "Progress", text: "Progress is rarely loud. Most days it looks like simply not giving up." },
  { id: "progress-04", kind: "QUESTION", theme: "Progress", text: "Which exercise or habit feels different now compared with when you began?" },
  { id: "progress-05", kind: "PROMPT", theme: "Progress", text: "Set one small goal for the next seven days and write how you will know you reached it." },
  { id: "progress-06", kind: "QUESTION", theme: "Progress", text: "How do you measure progress beyond the numbers?" },
  { id: "progress-07", kind: "QUOTE", theme: "Progress", text: "Compare yourself to who you were yesterday, not to who someone else is today." },
  { id: "progress-08", kind: "PROMPT", theme: "Progress", text: "Describe a moment this week when your training made everyday life easier." },

  // ─── Motivation ────────────────────────────────────────────────────────────
  {
    id: "motivation-01",
    kind: "QUOTE",
    theme: "Motivation",
    text: "Courage doesn't always roar. Sometimes courage is the quiet voice at the end of the day saying, \"I will try again tomorrow.\"",
    author: "Mary Anne Radmacher",
  },
  { id: "motivation-02", kind: "QUESTION", theme: "Motivation", text: "Why did you start? Has your reason changed since then?" },
  { id: "motivation-03", kind: "PROMPT", theme: "Motivation", text: "Picture yourself six months from now, having stuck with it. Describe a day in that life." },
  { id: "motivation-04", kind: "QUESTION", theme: "Motivation", text: "What part of today's training are you most looking forward to?" },
  { id: "motivation-05", kind: "QUOTE", theme: "Motivation", text: "You don't have to feel ready. You only have to begin." },
  { id: "motivation-06", kind: "PROMPT", theme: "Motivation", text: "Write down the people who would be proud to see you keep going, and why." },
  { id: "motivation-07", kind: "QUESTION", theme: "Motivation", text: "What would make this week feel like a success, even if it isn't perfect?" },
  { id: "motivation-08", kind: "QUOTE", theme: "Motivation", text: "Every rep, every walk, every early night is a vote for the person you are becoming." },
];

const LIBRARY_BY_ID = new Map(REFLECTION_LIBRARY.map((entry) => [entry.id, entry]));

export function getLibraryReflection(id: string): LibraryReflection | null {
  return LIBRARY_BY_ID.get(id) ?? null;
}

/** Fixed origin for the date rotation so every server picks the same entry on the same day. */
const ROTATION_EPOCH = new Date(Date.UTC(2026, 0, 1));

/**
 * The library entry for a given UTC day. Rotates through the whole library one
 * entry per day (a deterministic offset per client, when given, keeps clients
 * of the same trainer from all seeing the same fallback).
 */
export function getLibraryReflectionForDate(day: Date, seed = ""): LibraryReflection {
  const dayNumber = utcDaysBetween(ROTATION_EPOCH, day);
  const length = REFLECTION_LIBRARY.length;
  const index = (((dayNumber + seedOffset(seed)) % length) + length) % length;
  return REFLECTION_LIBRARY[index];
}

function seedOffset(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return hash;
}
