"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { REFLECTION_KIND_LABELS } from "@/lib/reflections/constants";
import { generateReflectionOptionsAction } from "@/actions/reflection-actions";
import type { GeneratedReflection } from "@/lib/services/reflection-ai.service";
import { AiStyleFields, toAiStyleInput, type AiStyleDraft } from "./ai-style-fields";

/**
 * "Generate with AI": settings, then three options each with Use this /
 * Regenerate (regenerating one option leaves the other two in place).
 */
export function AiReflectionGenerator({
  style,
  onStyleChange,
  onUse,
}: {
  style: AiStyleDraft;
  onStyleChange: (next: AiStyleDraft) => void;
  onUse: (option: GeneratedReflection) => void;
}) {
  const [options, setOptions] = useState<GeneratedReflection[]>([]);
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
  const [isGenerating, startGenerating] = useTransition();

  function generateAll() {
    startGenerating(async () => {
      const result = await generateReflectionOptionsAction(toAiStyleInput(style));
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setOptions(result.data);
    });
  }

  async function regenerateOne(index: number) {
    setRegeneratingIndex(index);
    try {
      const result = await generateReflectionOptionsAction(toAiStyleInput(style));
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      // Prefer a fresh option that isn't already on screen.
      const shown = new Set(options.map((option) => option.text));
      const replacement = result.data.find((option) => !shown.has(option.text)) ?? result.data[0];
      setOptions((current) => current.map((option, i) => (i === index ? replacement : option)));
    } finally {
      setRegeneratingIndex(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <AiStyleFields value={style} onChange={onStyleChange} />
      <Button type="button" className="w-fit" onClick={generateAll} disabled={isGenerating}>
        {isGenerating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        {options.length > 0 ? "Generate 3 new options" : "Generate 3 options"}
      </Button>

      {options.length > 0 && (
        <ul className="grid gap-3 md:grid-cols-3" aria-label="AI options">
          {options.map((option, index) => (
            <li
              key={`${index}-${option.text}`}
              className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 duration-300 animate-in fade-in motion-reduce:animate-none"
            >
              <span className="text-caption font-medium text-muted-foreground">
                Option {index + 1} · {REFLECTION_KIND_LABELS[option.kind]}
              </span>
              <p className="flex-1 text-body text-foreground">{option.text}</p>
              {option.guidance && <p className="text-caption text-muted-foreground">{option.guidance}</p>}
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => onUse(option)}>
                  <Check className="size-4" />
                  Use this
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => regenerateOne(index)}
                  disabled={regeneratingIndex !== null || isGenerating}
                >
                  <RefreshCw className={regeneratingIndex === index ? "size-4 animate-spin" : "size-4"} />
                  Regenerate
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
