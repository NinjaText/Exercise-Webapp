import type { ReflectionKind, ReflectionSource } from "@/lib/reflections/constants";
import type { LibraryReflection } from "@/lib/reflections/library";

/** Editable reflection content, as the trainer UI holds it (empty strings, not nulls). */
export interface ReflectionDraft {
  kind: ReflectionKind;
  text: string;
  author: string;
  guidance: string;
  theme: string;
  imageUrl: string | null;
  source: ReflectionSource;
  allowJournal: boolean;
  allowShare: boolean;
}

export function emptyDraft(): ReflectionDraft {
  return {
    kind: "PROMPT",
    text: "",
    author: "",
    guidance: "",
    theme: "",
    imageUrl: null,
    source: "CUSTOM",
    allowJournal: true,
    allowShare: true,
  };
}

export function draftFromLibrary(entry: LibraryReflection): ReflectionDraft {
  return {
    ...emptyDraft(),
    kind: entry.kind,
    text: entry.text,
    author: entry.author ?? "",
    theme: entry.theme,
    source: "LIBRARY",
  };
}

/** Rebuilds a draft from a stored reflection row (scheduled group or program day). */
export function draftFromStored(row: {
  kind: string;
  text: string;
  author: string | null;
  guidance: string | null;
  theme: string | null;
  imageUrl: string | null;
  source: string;
  allowJournal: boolean;
  allowShare: boolean;
}): ReflectionDraft {
  return {
    kind: (["QUOTE", "QUESTION", "PROMPT"].includes(row.kind) ? row.kind : "PROMPT") as ReflectionKind,
    text: row.text,
    author: row.author ?? "",
    guidance: row.guidance ?? "",
    theme: row.theme ?? "",
    imageUrl: row.imageUrl,
    source: (["CUSTOM", "AI", "LIBRARY"].includes(row.source) ? row.source : "CUSTOM") as ReflectionSource,
    allowJournal: row.allowJournal,
    allowShare: row.allowShare,
  };
}

/** The payload shape reflectionContentSchema expects. */
export function toContentInput(draft: ReflectionDraft) {
  return {
    kind: draft.kind,
    text: draft.text.trim(),
    author: draft.author.trim() || null,
    guidance: draft.guidance.trim() || null,
    theme: draft.theme.trim() || null,
    imageUrl: draft.imageUrl,
    source: draft.source,
    allowJournal: draft.allowJournal,
    allowShare: draft.allowShare,
  };
}
