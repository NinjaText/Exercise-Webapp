"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BODY_REGIONS, DIFFICULTY_LEVELS, COMMON_EQUIPMENT } from "@/lib/utils/constants";
import { createExerciseAction } from "@/actions/exercise-actions";
import { toast } from "sonner";
import { Loader2, Plus, X, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function ExerciseForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Multi-select body regions — first selected becomes primary bodyRegion
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);

  const [selectedDifficulty, setSelectedDifficulty] = useState("");

  // Equipment: preset chips + custom typed entries
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);
  const [customEquipmentInput, setCustomEquipmentInput] = useState("");
  const equipmentInputRef = useRef<HTMLInputElement>(null);

  const [videoUrl, setVideoUrl] = useState("");
  const [isAssessment, setIsAssessment] = useState(false);

  function toggleRegion(value: string) {
    setSelectedRegions((prev) =>
      prev.includes(value) ? prev.filter((r) => r !== value) : [...prev, value]
    );
  }

  function toggleEquipment(item: string) {
    setSelectedEquipment((prev) =>
      prev.includes(item) ? prev.filter((e) => e !== item) : [...prev, item]
    );
  }

  function addCustomEquipment() {
    const val = customEquipmentInput.trim();
    if (!val) return;
    if (!selectedEquipment.includes(val)) {
      setSelectedEquipment((prev) => [...prev, val]);
    }
    setCustomEquipmentInput("");
    equipmentInputRef.current?.focus();
  }

  function removeEquipment(item: string) {
    setSelectedEquipment((prev) => prev.filter((e) => e !== item));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (selectedRegions.length === 0) {
      toast.error("Please select at least one body region");
      return;
    }
    if (!selectedDifficulty) {
      toast.error("Please select a difficulty level");
      return;
    }

    setLoading(true);

    const formData = new FormData(e.currentTarget);

    const result = await createExerciseAction({
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || undefined,
      bodyRegion: selectedRegions,
      difficultyLevel: selectedDifficulty,
      equipmentRequired: selectedEquipment,
      contraindications:
        (formData.get("contraindications") as string)
          ?.split(",")
          .map((s) => s.trim())
          .filter(Boolean) || [],
      instructions: (formData.get("instructions") as string) || undefined,
      videoUrl: videoUrl || undefined,
      isAssessment,
    });

    setLoading(false);

    if (result.success) {
      toast.success("Exercise created successfully");
      const tab = result.data.source === "ORGANIZATION" ? "ORGANIZATION" : "UNIVERSAL";
      router.push(`/exercises?source=${tab}`);
    } else {
      toast.error(result.error);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Create New Exercise</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Exercise Name *</Label>
            <Input id="name" name="name" required placeholder="e.g., Wall Squat" />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              rows={3}
              placeholder="Brief clinical description of the exercise"
            />
          </div>

          {/* Body Regions — multi-select chips */}
          <div className="space-y-2">
            <Label>
              Body Region *
              {selectedRegions.length > 0 && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {selectedRegions.length} selected
                </span>
              )}
            </Label>
            <div className="flex flex-wrap gap-2">
              {BODY_REGIONS.map((r) => {
                const selected = selectedRegions.includes(r.value);
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => toggleRegion(r.value)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                      selected
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:border-primary/60 hover:text-foreground"
                    )}
                  >
                    {selected && <CheckCircle2 className="h-3.5 w-3.5" />}
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Difficulty — chip buttons */}
          <div className="space-y-2">
            <Label>Difficulty *</Label>
            <div className="flex gap-2">
              {DIFFICULTY_LEVELS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setSelectedDifficulty(d.value)}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                    selectedDifficulty === d.value
                      ? d.value === "BEGINNER"
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : d.value === "INTERMEDIATE"
                        ? "bg-amber-500 text-white border-amber-500"
                        : "bg-red-600 text-white border-red-600"
                      : "bg-background text-muted-foreground border-border hover:border-muted-foreground"
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Equipment — preset chips + custom input */}
          <div className="space-y-3">
            <Label>Equipment Required</Label>

            {/* Preset options */}
            <div className="flex flex-wrap gap-2">
              {COMMON_EQUIPMENT.map((eq) => (
                <button
                  key={eq}
                  type="button"
                  onClick={() => toggleEquipment(eq)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                    selectedEquipment.includes(eq)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-primary/60 hover:text-foreground"
                  )}
                >
                  {eq}
                </button>
              ))}
            </div>

            {/* Custom equipment input */}
            <div className="flex gap-2">
              <Input
                ref={equipmentInputRef}
                value={customEquipmentInput}
                onChange={(e) => setCustomEquipmentInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); addCustomEquipment(); }
                }}
                placeholder="Add custom equipment..."
                className="h-8 text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addCustomEquipment}
                className="h-8 gap-1 shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            </div>

            {/* Show custom-added equipment as removable chips */}
            {selectedEquipment.filter(eq => !COMMON_EQUIPMENT.includes(eq as typeof COMMON_EQUIPMENT[number])).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedEquipment
                  .filter(eq => !COMMON_EQUIPMENT.includes(eq as typeof COMMON_EQUIPMENT[number]))
                  .map((eq) => (
                    <span
                      key={eq}
                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 text-sm font-medium"
                    >
                      {eq}
                      <button type="button" onClick={() => removeEquipment(eq)} className="hover:text-primary/70">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
              </div>
            )}
          </div>

          {/* Instructions */}
          <div className="space-y-2">
            <Label htmlFor="instructions">Instructions</Label>
            <Textarea
              id="instructions"
              name="instructions"
              rows={4}
              placeholder="Step-by-step instructions for the client"
            />
          </div>

          {/* Contraindications */}
          <div className="space-y-2">
            <Label htmlFor="contraindications">Contraindications</Label>
            <Input
              id="contraindications"
              name="contraindications"
              placeholder="e.g., Knee replacement, Acute back pain (comma separated)"
            />
          </div>

          {/* Assessment exercise toggle */}
          <div className="flex items-start gap-3 rounded-lg border border-border p-4">
            <Checkbox
              id="isAssessment"
              checked={isAssessment}
              onCheckedChange={(checked) => setIsAssessment(checked === true)}
            />
            <div className="space-y-1">
              <Label htmlFor="isAssessment" className="font-medium">
                Assessment exercise
              </Label>
              <p className="text-xs text-muted-foreground">
                Used to evaluate a client (e.g. a movement screen or timed test) rather than to train
                them. Assessment exercises are excluded from AI-generated programs and the
                add-exercise picker.
              </p>
            </div>
          </div>

          {/* YouTube URL only */}
          <div className="space-y-2">
            <Label htmlFor="videoUrl">Video Demo (YouTube URL)</Label>
            <div className="relative">
              <Input
                id="videoUrl"
                type="url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className={videoUrl ? "pr-8" : ""}
              />
              {videoUrl && (
                <button
                  type="button"
                  onClick={() => setVideoUrl("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {videoUrl && (
              <p className="flex items-center gap-1.5 text-xs text-green-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                YouTube URL added
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Exercise
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
