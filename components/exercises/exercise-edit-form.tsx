"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BODY_REGIONS, DIFFICULTY_LEVELS, COMMON_EQUIPMENT } from "@/lib/utils/constants";
import { updateExerciseAction, addExerciseMediaAction, deleteExerciseMediaAction } from "@/actions/exercise-actions";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Play, Trash2, X, Plus } from "lucide-react";
import { ExerciseVideoPlayer } from "@/components/exercises/exercise-video-player";
import { cn } from "@/lib/utils";

interface MediaItem {
  id: string;
  mediaType: string;
  url: string;
  thumbnailUrl: string | null;
  altText: string | null;
}

interface Exercise {
  id: string;
  name: string;
  description: string | null;
  bodyRegion: string[];
  difficultyLevel: string;
  equipmentRequired: string[];
  contraindications: string[];
  instructions: string | null;
  videoUrl: string | null;
  imageUrl: string | null;
  isActive: boolean;
  isAssessment: boolean;
  media: MediaItem[];
}

interface Props {
  exercise: Exercise;
}

export function ExerciseEditForm({ exercise }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // All fields controlled — eliminates the uncontrolled warning
  const [name, setName] = useState(exercise.name);
  const [description, setDescription] = useState(exercise.description ?? "");
  const [selectedRegions, setSelectedRegions] = useState<string[]>(exercise.bodyRegion);
  const [difficultyLevel, setDifficultyLevel] = useState(exercise.difficultyLevel);
  const [isActive, setIsActive] = useState(String(exercise.isActive));
  const [isAssessment, setIsAssessment] = useState(exercise.isAssessment);
  const [instructions, setInstructions] = useState(exercise.instructions ?? "");
  const [contraindications, setContraindications] = useState(
    exercise.contraindications.join(", ")
  );
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>(
    exercise.equipmentRequired
  );
  const [customEquipmentInput, setCustomEquipmentInput] = useState("");
  const equipmentInputRef = useRef<HTMLInputElement>(null);
  const [videoUrl, setVideoUrl] = useState(exercise.videoUrl ?? "");
  const [imageUrl, setImageUrl] = useState(exercise.imageUrl ?? "");
  const [mediaItems, setMediaItems] = useState<MediaItem[]>(exercise.media);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (selectedRegions.length === 0) {
      toast.error("Please select at least one body region");
      return;
    }

    setLoading(true);

    const result = await updateExerciseAction(exercise.id, {
      name: name.trim(),
      description: description.trim() || undefined,
      bodyRegion: selectedRegions,
      difficultyLevel,
      equipmentRequired: selectedEquipment,
      contraindications: contraindications
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      instructions: instructions.trim() || undefined,
      videoUrl: videoUrl.trim() || undefined,
      imageUrl: imageUrl.trim() || undefined,
      isActive: isActive === "true",
      isAssessment,
    });

    setLoading(false);

    if (result.success) {
      toast.success("Exercise updated successfully");
      router.push(`/exercises/${exercise.id}`);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  function toggleEquipment(item: string) {
    setSelectedEquipment((prev) =>
      prev.includes(item) ? prev.filter((e) => e !== item) : [...prev, item]
    );
  }

  function toggleRegion(value: string) {
    setSelectedRegions((prev) =>
      prev.includes(value) ? prev.filter((r) => r !== value) : [...prev, value]
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

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Edit: {exercise.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Exercise Name *</Label>
            <Input
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Body Region — multi-select chips */}
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

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief clinical description"
            />
          </div>

          {/* Difficulty + Status */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="difficultyLevel">Difficulty *</Label>
              <select
                id="difficultyLevel"
                required
                value={difficultyLevel}
                onChange={(e) => setDifficultyLevel(e.target.value)}
                className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
              >
                <option value="">Select difficulty</option>
                {DIFFICULTY_LEVELS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="isActive">Status</Label>
              <select
                id="isActive"
                value={isActive}
                onChange={(e) => setIsActive(e.target.value)}
                className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
              >
                <option value="true">Active — visible to AI</option>
                <option value="false">Inactive — hidden from AI</option>
              </select>
            </div>
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

          {/* Equipment */}
          <div className="space-y-3">
            <Label>Equipment Required</Label>

            <div className="flex flex-wrap gap-2">
              {COMMON_EQUIPMENT.map((eq) => (
                <Button
                  key={eq}
                  type="button"
                  variant={selectedEquipment.includes(eq) ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleEquipment(eq)}
                >
                  {eq}
                </Button>
              ))}
            </div>

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
              rows={5}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Step-by-step instructions for the client"
            />
          </div>

          {/* Contraindications */}
          <div className="space-y-2">
            <Label htmlFor="contraindications">Contraindications (comma separated)</Label>
            <Input
              id="contraindications"
              value={contraindications}
              onChange={(e) => setContraindications(e.target.value)}
              placeholder="e.g., Knee replacement, Acute back pain"
            />
          </div>

          {/* ── VIDEO ── */}
          <div className="space-y-4 rounded-lg border border-border p-4">
            <div>
              <h3 className="font-semibold text-foreground">Video Demo</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Paste a YouTube link — it plays inline in the client&apos;s plan. The <span className="font-medium text-blue-600">YouTube thumbnail auto-becomes the exercise image</span> if no photo is set.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="videoUrl">YouTube URL</Label>
              <Input
                id="videoUrl"
                type="url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
              />
            </div>

            {/* Live YouTube preview */}
            {videoUrl && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Live Preview</p>
                <ExerciseVideoPlayer
                  videoUrl={videoUrl}
                  mediaItems={[]}
                  className="w-full max-w-md"
                />
              </div>
            )}

            {/* Uploaded video indicator */}
            {videoUrl && !videoUrl.includes("youtube") && !videoUrl.includes("youtu.be") && (
              <div className="flex items-center gap-2 rounded-md bg-green-50 border border-green-200 px-3 py-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                <span className="text-xs text-green-700 truncate flex-1">{videoUrl}</span>
                <button type="button" onClick={() => setVideoUrl("")}>
                  <X className="h-3.5 w-3.5 text-green-600" />
                </button>
              </div>
            )}
          </div>

          {/* ── IMAGE ── */}
          <div className="space-y-4 rounded-lg border border-border p-4">
            <div>
              <h3 className="font-semibold text-foreground">Exercise Image</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Shown as a thumbnail on exercise cards and in the PDF handout
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="imageUrl">Image URL</Label>
              <Input
                id="imageUrl"
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://example.com/exercise-photo.jpg"
              />
              <p className="text-xs text-muted-foreground">Paste any image URL from the web</p>
            </div>

            {/* Image preview using regular img (no Next.js hostname restrictions for preview) */}
            {imageUrl && (
              <div className="relative">
                <div className="relative h-40 w-full overflow-hidden rounded-lg bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt="Exercise preview"
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setImageUrl("")}
                  className="absolute right-2 top-2 rounded-full bg-white p-1 shadow-md"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
            )}

          </div>

          {/* ── ADDITIONAL MEDIA GALLERY ── */}
          <div className="space-y-4 rounded-lg border border-border p-4">
            <div>
              <h3 className="font-semibold text-foreground">Additional Media</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Add multiple photos and videos — shown in a gallery on the exercise detail page
              </p>
            </div>

            {/* Existing media items */}
            {mediaItems.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {mediaItems.map((item) => (
                  <div key={item.id} className="group relative rounded-lg overflow-hidden bg-muted">
                    {item.mediaType === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.url}
                        alt={item.altText ?? "Exercise photo"}
                        className="h-28 w-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <div className="flex h-28 items-center justify-center bg-muted-foreground/10">
                        <Play className="h-8 w-8 text-white" />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/50 px-2 py-1">
                      <span className="text-xs text-white capitalize">{item.mediaType}</span>
                      <button
                        type="button"
                        onClick={async () => {
                          const result = await deleteExerciseMediaAction(exercise.id, item.id);
                          if (result.success) {
                            setMediaItems((prev) => prev.filter((m) => m.id !== item.id));
                            toast.success("Media removed");
                          } else {
                            toast.error(result.error);
                          }
                        }}
                        className="rounded p-0.5 text-white hover:bg-red-500/80"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="text-sm text-muted-foreground">File upload is temporarily unavailable. Use the URL fields above to add media.</p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </div>

        </CardContent>
      </Card>
    </form>
  );
}
