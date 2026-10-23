"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AI_AUDIENCE_MAX,
  AI_CONTEXT_MAX,
  REFLECTION_KINDS,
  REFLECTION_KIND_LABELS,
  REFLECTION_THEMES,
  REFLECTION_TONES,
  type ReflectionKind,
  type ReflectionTone,
} from "@/lib/reflections/constants";

export interface AiStyleDraft {
  theme: string;
  tone: ReflectionTone;
  kind: ReflectionKind | "MIXED";
  audience: string;
  context: string;
}

export function defaultAiStyle(): AiStyleDraft {
  return { theme: "Consistency", tone: "Encouraging", kind: "MIXED", audience: "", context: "" };
}

const KIND_OPTIONS: Array<{ value: AiStyleDraft["kind"]; label: string }> = [
  { value: "MIXED", label: "Mixed" },
  ...REFLECTION_KINDS.map((kind) => ({ value: kind, label: REFLECTION_KIND_LABELS[kind] })),
];

/** AI settings: theme, tone, type, audience and extra context. */
export function AiStyleFields({
  value,
  onChange,
  showAudience = true,
}: {
  value: AiStyleDraft;
  onChange: (next: AiStyleDraft) => void;
  showAudience?: boolean;
}) {
  const id = useId();
  const set = <K extends keyof AiStyleDraft>(key: K, next: AiStyleDraft[K]) => onChange({ ...value, [key]: next });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-theme`}>Theme</Label>
          <Select value={value.theme} onValueChange={(next) => next && set("theme", next)}>
            <SelectTrigger id={`${id}-theme`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REFLECTION_THEMES.map((theme) => (
                <SelectItem key={theme} value={theme}>
                  {theme}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-tone`}>Tone</Label>
          <Select value={value.tone} onValueChange={(next) => next && set("tone", next as ReflectionTone)}>
            <SelectTrigger id={`${id}-tone`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REFLECTION_TONES.map((tone) => (
                <SelectItem key={tone} value={tone}>
                  {tone}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-kind`}>Type</Label>
          <Select value={value.kind} onValueChange={(next) => next && set("kind", next as AiStyleDraft["kind"])}>
            <SelectTrigger id={`${id}-kind`}>
              <SelectValue>
                {(selected: string | null) => KIND_OPTIONS.find((option) => option.value === selected)?.label ?? "Mixed"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {KIND_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {showAudience && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-audience`}>Audience (optional)</Label>
          <Input
            id={`${id}-audience`}
            value={value.audience}
            onChange={(event) => set("audience", event.target.value)}
            maxLength={AI_AUDIENCE_MAX}
            placeholder="e.g. Post-op knee rehab clients, busy parents"
          />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-context`}>Extra context (optional)</Label>
        <Textarea
          id={`${id}-context`}
          value={value.context}
          onChange={(event) => set("context", event.target.value)}
          maxLength={AI_CONTEXT_MAX}
          rows={2}
          placeholder="Anything the AI should know — goals, the program's focus, words to avoid…"
        />
      </div>
    </div>
  );
}

/** The payload shape the AI validators expect. */
export function toAiStyleInput(style: AiStyleDraft) {
  return {
    theme: style.theme,
    tone: style.tone,
    kind: style.kind,
    audience: style.audience.trim() || null,
    context: style.context.trim() || null,
  };
}
