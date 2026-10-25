"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  REFLECTION_AUTHOR_MAX,
  REFLECTION_GUIDANCE_MAX,
  REFLECTION_KINDS,
  REFLECTION_KIND_LABELS,
  REFLECTION_TEXT_MAX,
  REFLECTION_THEMES,
} from "@/lib/reflections/constants";
import { ReflectionImageField } from "./reflection-image-field";
import type { ReflectionDraft } from "./reflection-draft";

const NO_THEME = "__none__";

/**
 * The review/edit form for one reflection: kind, text, attribution, extra
 * guidance, theme, optional image and the journal / share switches. Used by
 * the Create flow, program-day editing and scheduled-group editing.
 */
export function ReflectionEditorFields({
  value,
  onChange,
}: {
  value: ReflectionDraft;
  onChange: (next: ReflectionDraft) => void;
}) {
  const id = useId();
  const set = <K extends keyof ReflectionDraft>(key: K, next: ReflectionDraft[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-label text-foreground">Type</legend>
        <div className="flex flex-wrap gap-2">
          {REFLECTION_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={value.kind === kind}
              onClick={() => set("kind", kind)}
              className="rounded-full border border-border bg-surface px-3 py-1.5 text-label text-muted-foreground transition-colors outline-none hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-brand-border aria-pressed:bg-brand-soft aria-pressed:text-brand motion-reduce:transition-none"
            >
              {REFLECTION_KIND_LABELS[kind]}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor={`${id}-text`}>Reflection</Label>
          <span className="text-caption text-muted-foreground tabular-nums">
            {value.text.length}/{REFLECTION_TEXT_MAX}
          </span>
        </div>
        <Textarea
          id={`${id}-text`}
          value={value.text}
          onChange={(event) => set("text", event.target.value)}
          maxLength={REFLECTION_TEXT_MAX}
          rows={3}
          placeholder={
            value.kind === "QUESTION"
              ? "e.g. What is one small win from today?"
              : value.kind === "QUOTE"
                ? "The quote, without quotation marks"
                : "e.g. Write about a moment today when you felt strong."
          }
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {value.kind === "QUOTE" && (
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-author`}>Author (optional)</Label>
            <Input
              id={`${id}-author`}
              value={value.author}
              onChange={(event) => set("author", event.target.value)}
              maxLength={REFLECTION_AUTHOR_MAX}
              placeholder="Only if you're sure of the source"
            />
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-theme`}>Theme</Label>
          <Select value={value.theme || NO_THEME} onValueChange={(next) => set("theme", next && next !== NO_THEME ? next : "")}>
            <SelectTrigger id={`${id}-theme`}>
              <SelectValue>{(selected: string | null) => (selected && selected !== NO_THEME ? selected : "No theme")}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_THEME}>No theme</SelectItem>
              {REFLECTION_THEMES.map((theme) => (
                <SelectItem key={theme} value={theme}>
                  {theme}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-guidance`}>Additional guidance (optional)</Label>
        <Textarea
          id={`${id}-guidance`}
          value={value.guidance}
          onChange={(event) => set("guidance", event.target.value)}
          maxLength={REFLECTION_GUIDANCE_MAX}
          rows={2}
          placeholder="A short hint shown under the reflection, e.g. “Take two minutes before bed.”"
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-label text-foreground">Image</span>
        <ReflectionImageField value={value.imageUrl} onChange={(url) => set("imageUrl", url)} />
      </div>

      <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
        <ToggleRow
          id={`${id}-journal`}
          label="Allow journaling"
          description="Clients can write a private journal entry about it."
          checked={value.allowJournal}
          onChange={(checked) => set("allowJournal", checked)}
        />
        <ToggleRow
          id={`${id}-share`}
          label="Allow sharing with you"
          description="Clients can send their reflection to your inbox."
          checked={value.allowShare}
          onChange={(checked) => set("allowShare", checked)}
        />
      </div>
    </div>
  );
}

function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-caption text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={(next) => onChange(next)} />
    </div>
  );
}
