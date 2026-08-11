"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { BODY_REGIONS, DIFFICULTY_LEVELS, COMMON_EQUIPMENT } from "@/lib/utils/constants";
import { bulkCreateExercisesAction, type BulkExerciseInput } from "@/actions/bulk-exercise-actions";
import { isYouTubeUrl, isYouTubePlaylistUrl } from "@/lib/utils/video";
import { toast } from "sonner";
import {
  Loader2, Sparkles, ChevronDown, ChevronUp,
  Trash2, CheckCircle2, Video,
  AlertCircle, Youtube, ListVideo, Search, ClipboardCheck,
} from "lucide-react";

const EXERCISE_PHASES = [
  { value: "WARMUP", label: "Warm-up" },
  { value: "ACTIVATION", label: "Activation" },
  { value: "STRENGTHENING", label: "Strengthening" },
  { value: "MOBILITY", label: "Mobility" },
  { value: "COOLDOWN", label: "Cool-down" },
] as const;

type AiStatus = "idle" | "loading" | "done" | "error";
type ImportMode = "youtube" | "playlist" | "search";
type ExerciseContext = "CLINICAL" | "PERFORMANCE";

interface PlaylistVideo {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  videoUrl: string;
  position: number;
}

interface SearchVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  videoUrl: string;
}

/** Shared shape the video-selection grid renders — subtitle differs per mode
 *  (playlist position vs. channel name). */
interface SelectableVideo {
  videoId: string;
  title: string;
  subtitle: string;
  thumbnailUrl: string;
  videoUrl: string;
}

function VideoSelectionGrid({
  videos,
  selectedIds,
  onToggle,
  onSelectAll,
  onDeselectAll,
  maxSelectable,
  disabled,
}: {
  videos: SelectableVideo[];
  selectedIds: Set<string>;
  onToggle: (videoId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  maxSelectable: number;
  disabled?: boolean;
}) {
  const selectedCount = selectedIds.size;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">
          <span className="text-foreground font-semibold">{selectedCount}</span> of {videos.length} selected
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onSelectAll} disabled={disabled}>
            Select all
          </Button>
          <Button variant="ghost" size="sm" onClick={onDeselectAll} disabled={disabled}>
            Deselect all
          </Button>
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto rounded-lg border divide-y">
        {videos.map((video) => {
          const isSelected = selectedIds.has(video.videoId);
          return (
            <button
              key={video.videoId}
              type="button"
              onClick={() => onToggle(video.videoId)}
              disabled={disabled}
              className={[
                "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
                isSelected ? "bg-primary/5" : "",
              ].join(" ")}
            >
              <div className={[
                "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors",
                isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border",
              ].join(" ")}>
                {isSelected && <CheckCircle2 className="h-3 w-3" />}
              </div>
              {video.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={video.thumbnailUrl}
                  alt=""
                  className="h-10 w-16 shrink-0 rounded object-cover"
                />
              ) : (
                <div className="h-10 w-16 shrink-0 rounded bg-muted flex items-center justify-center">
                  <Youtube className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{video.title}</p>
                <p className="truncate text-xs text-muted-foreground">{video.subtitle}</p>
              </div>
            </button>
          );
        })}
      </div>

      {selectedCount > maxSelectable && (
        <p className="text-sm text-destructive">
          Select at most {maxSelectable} videos at a time to generate exercises.
        </p>
      )}
    </div>
  );
}

interface ExerciseRow {
  rowId: string;
  videoUrl: string;
  videoFileName: string;
  imageUrl: string;
  name: string;
  description: string;
  instructions: string;
  bodyRegion: string[];
  difficultyLevel: string;
  exercisePhases: string[];
  musclesTargeted: string;
  equipmentRequired: string[];
  contraindications: string;
  commonMistakes: string;
  defaultSets: string;
  defaultReps: string;
  isAssessment: boolean;
  aiStatus: AiStatus;
  expanded: boolean;
}

function makeRow(videoUrl: string, videoFileName: string, imageUrl = ""): ExerciseRow {
  return {
    rowId: crypto.randomUUID(),
    videoUrl,
    videoFileName,
    imageUrl,
    name: "",
    description: "",
    instructions: "",
    bodyRegion: [],
    difficultyLevel: "",
    exercisePhases: [],
    musclesTargeted: "",
    equipmentRequired: [],
    contraindications: "",
    commonMistakes: "",
    defaultSets: "3",
    defaultReps: "10",
    isAssessment: false,
    aiStatus: "idle",
    expanded: true,
  };
}

function parseYoutubeUrls(raw: string): string[] {
  return raw
    .split(/[\n,\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && isYouTubeUrl(s) && !isYouTubePlaylistUrl(s));
}

// ─── Main component ──────────────────────────────────────────────────────────

export function BulkImportForm() {
  const router = useRouter();

  const [mode, setMode] = useState<ImportMode>("youtube");
  const [exerciseContext, setExerciseContext] = useState<ExerciseContext>("CLINICAL");

  const [youtubeInput, setYoutubeInput] = useState("");
  const [ytProcessing, setYtProcessing] = useState(false);
  const [ytProgress, setYtProgress] = useState({ done: 0, total: 0 });

  // Playlist state
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [playlistVideos, setPlaylistVideos] = useState<PlaylistVideo[]>([]);
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchVideos, setSearchVideos] = useState<SearchVideo[]>([]);
  const [selectedSearchVideoIds, setSelectedSearchVideoIds] = useState<Set<string>>(new Set());

  const [rows, setRows] = useState<ExerciseRow[]>([]);
  const [publishing, setPublishing] = useState(false);

  // ── Shared URL processing ────────────────────────────────────────────────────

  async function processUrlBatch(urls: string[]) {
    setYtProgress({ done: 0, total: urls.length });
    let successCount = 0;

    for (const url of urls) {
      try {
        const res = await fetch("/api/ai/generate-exercise-metadata", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ youtubeUrl: url, context: exerciseContext }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(`Skipped one URL: ${err.error ?? "failed"}`);
          setYtProgress((p) => ({ ...p, done: p.done + 1 }));
          continue;
        }

        const { data: d } = await res.json();
        const newRow = makeRow(d.videoUrl ?? url, d.exerciseName ?? url, d.imageUrl ?? "");
        newRow.name = d.exerciseName ?? "";
        newRow.description = d.description ?? "";
        newRow.instructions = d.instructions ?? "";
        newRow.bodyRegion = d.bodyRegion ?? [];
        newRow.difficultyLevel = d.difficultyLevel ?? "";
        newRow.exercisePhases = d.exercisePhases ?? [];
        newRow.musclesTargeted = (d.musclesTargeted ?? []).join(", ");
        newRow.equipmentRequired = d.equipmentRequired ?? [];
        newRow.contraindications = (d.contraindications ?? []).join(", ");
        newRow.commonMistakes = d.commonMistakes ?? "";
        newRow.defaultSets = String(d.defaultSets ?? 3);
        newRow.defaultReps = String(d.defaultReps ?? 10);
        newRow.isAssessment = d.isAssessment ?? false;
        newRow.aiStatus = "done";

        setRows((prev) => [...prev, newRow]);
        successCount++;
      } catch {
        toast.error("Failed to process one URL — skipped");
      }
      setYtProgress((p) => ({ ...p, done: p.done + 1 }));
    }

    setYtProgress({ done: 0, total: 0 });
    return successCount;
  }

  // ── YouTube URL processing ───────────────────────────────────────────────────

  async function processYoutubeUrls() {
    const urls = parseYoutubeUrls(youtubeInput);
    if (!urls.length) { toast.error("No valid YouTube URLs found"); return; }
    if (urls.length > 30) { toast.error("Maximum 30 URLs at a time"); return; }

    setYtProcessing(true);
    const successCount = await processUrlBatch(urls);
    setYtProcessing(false);

    if (successCount > 0) {
      setYoutubeInput("");
      toast.success(`${successCount} exercise${successCount === 1 ? "" : "s"} generated from YouTube`);
    }
  }

  // ── Playlist processing ──────────────────────────────────────────────────────

  async function fetchPlaylist() {
    if (!playlistUrl.trim()) { toast.error("Enter a playlist URL"); return; }
    if (!isYouTubePlaylistUrl(playlistUrl)) { toast.error("That doesn't look like a YouTube playlist URL"); return; }

    setPlaylistLoading(true);
    setPlaylistVideos([]);
    setSelectedVideoIds(new Set());

    try {
      const res = await fetch(`/api/youtube/playlist-videos?url=${encodeURIComponent(playlistUrl)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Failed to fetch playlist");
        return;
      }
      const { videos, total } = await res.json();
      setPlaylistVideos(videos);
      setSelectedVideoIds(new Set((videos as PlaylistVideo[]).map((v) => v.videoId)));
      if (total === 200) {
        toast.info("Showing first 200 videos — deselect any you don't want before generating");
      } else {
        toast.success(`Found ${total} video${total === 1 ? "" : "s"} in playlist`);
      }
    } catch {
      toast.error("Failed to fetch playlist — check the URL and try again");
    } finally {
      setPlaylistLoading(false);
    }
  }

  function toggleVideoSelection(videoId: string) {
    setSelectedVideoIds((prev) => {
      const next = new Set(prev);
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      return next;
    });
  }

  function selectAllVideos() {
    setSelectedVideoIds(new Set(playlistVideos.map((v) => v.videoId)));
  }

  function deselectAllVideos() {
    setSelectedVideoIds(new Set());
  }

  async function processPlaylistSelection() {
    const selected = playlistVideos.filter((v) => selectedVideoIds.has(v.videoId));
    if (!selected.length) { toast.error("Select at least one video"); return; }
    if (selected.length > 30) { toast.error("Select at most 30 videos at a time"); return; }

    setYtProcessing(true);
    const urls = selected.map((v) => v.videoUrl);
    const successCount = await processUrlBatch(urls);
    setYtProcessing(false);

    if (successCount > 0) {
      toast.success(`${successCount} exercise${successCount === 1 ? "" : "s"} generated from playlist`);
      setPlaylistVideos([]);
      setSelectedVideoIds(new Set());
      setPlaylistUrl("");
    }
  }

  // ── Search processing ────────────────────────────────────────────────────────

  async function runSearch() {
    if (!searchQuery.trim()) { toast.error("Enter a search term"); return; }

    setSearchLoading(true);
    setSearchVideos([]);
    setSelectedSearchVideoIds(new Set());

    try {
      const res = await fetch(`/api/youtube/search-videos?q=${encodeURIComponent(searchQuery)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Search failed");
        return;
      }
      const { videos, total } = await res.json();
      setSearchVideos(videos);
      // Unlike playlists (already curated by the trainer), raw search results
      // are noisy — nothing is pre-selected; the trainer picks deliberately.
      if (total === 0) {
        toast.info("No videos found — try different search terms");
      } else {
        toast.success(`Found ${total} video${total === 1 ? "" : "s"} — select the ones to import`);
      }
    } catch {
      toast.error("Search failed — try again");
    } finally {
      setSearchLoading(false);
    }
  }

  function toggleSearchVideoSelection(videoId: string) {
    setSelectedSearchVideoIds((prev) => {
      const next = new Set(prev);
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      return next;
    });
  }

  function selectAllSearchVideos() {
    setSelectedSearchVideoIds(new Set(searchVideos.map((v) => v.videoId)));
  }

  function deselectAllSearchVideos() {
    setSelectedSearchVideoIds(new Set());
  }

  async function processSearchSelection() {
    const selected = searchVideos.filter((v) => selectedSearchVideoIds.has(v.videoId));
    if (!selected.length) { toast.error("Select at least one video"); return; }
    if (selected.length > 30) { toast.error("Select at most 30 videos at a time"); return; }

    setYtProcessing(true);
    const urls = selected.map((v) => v.videoUrl);
    const successCount = await processUrlBatch(urls);
    setYtProcessing(false);

    if (successCount > 0) {
      toast.success(`${successCount} exercise${successCount === 1 ? "" : "s"} generated from search`);
      setSearchVideos([]);
      setSelectedSearchVideoIds(new Set());
      setSearchQuery("");
    }
  }

  // ── Row helpers ─────────────────────────────────────────────────────────────

  function updateRow(rowId: string, patch: Partial<ExerciseRow>) {
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  }

  function removeRow(rowId: string) {
    setRows((prev) => prev.filter((r) => r.rowId !== rowId));
  }

  function toggleBodyRegion(rowId: string, region: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.rowId !== rowId) return r;
        const has = r.bodyRegion.includes(region);
        return { ...r, bodyRegion: has ? r.bodyRegion.filter((v) => v !== region) : [...r.bodyRegion, region] };
      })
    );
  }

  function toggleEquipment(rowId: string, item: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.rowId !== rowId) return r;
        const has = r.equipmentRequired.includes(item);
        return { ...r, equipmentRequired: has ? r.equipmentRequired.filter((e) => e !== item) : [...r.equipmentRequired, item] };
      })
    );
  }

  async function generateMetadata(rowId: string) {
    const row = rows.find((r) => r.rowId === rowId);
    if (!row?.name.trim()) { toast.error("Enter an exercise name first"); return; }
    updateRow(rowId, { aiStatus: "loading" });
    try {
      const res = await fetch("/api/ai/generate-exercise-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: row.name, context: exerciseContext }),
      });
      if (!res.ok) throw new Error();
      const { data: d } = await res.json();
      updateRow(rowId, {
        aiStatus: "done",
        description: d.description ?? "",
        instructions: d.instructions ?? "",
        bodyRegion: d.bodyRegion ?? [],
        difficultyLevel: d.difficultyLevel ?? "",
        exercisePhases: d.exercisePhases ?? [],
        musclesTargeted: (d.musclesTargeted ?? []).join(", "),
        equipmentRequired: d.equipmentRequired ?? [],
        contraindications: (d.contraindications ?? []).join(", "),
        commonMistakes: d.commonMistakes ?? "",
        defaultSets: String(d.defaultSets ?? 3),
        defaultReps: String(d.defaultReps ?? 10),
        isAssessment: d.isAssessment ?? false,
      });
      toast.success(`Metadata generated for "${row.name}"`);
    } catch {
      updateRow(rowId, { aiStatus: "error" });
      toast.error("AI generation failed — try again");
    }
  }

  // ── Publish ─────────────────────────────────────────────────────────────────

  const readyCount = rows.filter((r) => r.name.trim() && r.bodyRegion.length > 0 && r.difficultyLevel).length;

  async function handlePublish() {
    const ready = rows.filter((r) => r.name.trim() && r.bodyRegion.length > 0 && r.difficultyLevel);
    if (!ready.length) { toast.error("Each exercise needs a name, body region, and difficulty"); return; }
    setPublishing(true);
    const payload: BulkExerciseInput[] = ready.map((r) => ({
      name: r.name.trim(),
      description: r.description || undefined,
      instructions: r.instructions || undefined,
      bodyRegion: r.bodyRegion,
      difficultyLevel: r.difficultyLevel,
      exercisePhases: r.exercisePhases,
      isAssessment: r.isAssessment,
      musclesTargeted: r.musclesTargeted.split(",").map((s) => s.trim()).filter(Boolean),
      equipmentRequired: r.equipmentRequired,
      contraindications: r.contraindications.split(",").map((s) => s.trim()).filter(Boolean),
      commonMistakes: r.commonMistakes || undefined,
      defaultSets: parseInt(r.defaultSets) || undefined,
      defaultReps: parseInt(r.defaultReps) || undefined,
      videoUrl: r.videoUrl || undefined,
      imageUrl: r.imageUrl || undefined,
    }));
    const result = await bulkCreateExercisesAction(payload);
    setPublishing(false);
    if (result.success) {
      toast.success(`${result.count} exercise${result.count === 1 ? "" : "s"} added to library`);
      router.push("/exercises");
    } else {
      toast.error(result.error);
    }
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const ytUrls = parseYoutubeUrls(youtubeInput);
  const ytProgressPct = ytProgress.total > 0 ? Math.round((ytProgress.done / ytProgress.total) * 100) : 0;
  const selectedCount = selectedVideoIds.size;
  const searchSelectedCount = selectedSearchVideoIds.size;
  const playlistSelectableVideos: SelectableVideo[] = playlistVideos.map((v) => ({
    videoId: v.videoId,
    title: v.title,
    subtitle: `#${v.position + 1}`,
    thumbnailUrl: v.thumbnailUrl,
    videoUrl: v.videoUrl,
  }));
  const searchSelectableVideos: SelectableVideo[] = searchVideos.map((v) => ({
    videoId: v.videoId,
    title: v.title,
    subtitle: v.channelTitle,
    thumbnailUrl: v.thumbnailUrl,
    videoUrl: v.videoUrl,
  }));

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">

      {/* ── Mode tabs ── */}
      <div className="flex gap-1 rounded-xl border bg-muted/40 p-1">
        <button
          type="button"
          onClick={() => setMode("youtube")}
          className={[
            "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
            mode === "youtube"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground",
          ].join(" ")}
        >
          <Youtube className="h-4 w-4" />
          YouTube URLs
        </button>
        <button
          type="button"
          onClick={() => setMode("playlist")}
          className={[
            "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
            mode === "playlist"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground",
          ].join(" ")}
        >
          <ListVideo className="h-4 w-4" />
          From Playlist
        </button>
        <button
          type="button"
          onClick={() => setMode("search")}
          className={[
            "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
            mode === "search"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground",
          ].join(" ")}
        >
          <Search className="h-4 w-4" />
          Search
        </button>
      </div>

      {/* ── Exercise Context ── */}
      <div className="flex items-center justify-between rounded-xl border bg-muted/40 p-3">
        <div>
          <p className="text-sm font-medium">Exercise Context</p>
          <p className="text-xs text-muted-foreground">
            Shapes the tone of AI-generated metadata for every video processed below.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border bg-background p-1">
          <button
            type="button"
            onClick={() => setExerciseContext("CLINICAL")}
            className={[
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              exerciseContext === "CLINICAL" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            Rehab / Clinical
          </button>
          <button
            type="button"
            onClick={() => setExerciseContext("PERFORMANCE")}
            className={[
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              exerciseContext === "PERFORMANCE" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            Athletic / Performance
          </button>
        </div>
      </div>

      {/* ── YouTube URLs panel ── */}
      {mode === "youtube" && (
        <div className="space-y-4">
          <div className="rounded-xl border bg-background shadow-sm">
            <div className="border-b px-5 py-4">
              <p className="font-medium">Paste YouTube URLs</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                One URL per line — AI will fetch each video&apos;s title and generate professional exercise metadata automatically.
              </p>
            </div>
            <div className="p-4 space-y-3">
              <Textarea
                placeholder={`https://www.youtube.com/watch?v=abc123\nhttps://youtu.be/def456\nhttps://www.youtube.com/watch?v=ghi789`}
                value={youtubeInput}
                onChange={(e) => setYoutubeInput(e.target.value)}
                rows={6}
                className="font-mono text-sm resize-none"
                disabled={ytProcessing}
              />

              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {ytUrls.length > 0
                    ? <span className="text-foreground font-medium">{ytUrls.length} valid YouTube URL{ytUrls.length === 1 ? "" : "s"} detected</span>
                    : "Paste YouTube links above"
                  }
                </p>
                <Button
                  onClick={processYoutubeUrls}
                  disabled={ytUrls.length === 0 || ytProcessing}
                >
                  {ytProcessing
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <Sparkles className="mr-2 h-4 w-4" />
                  }
                  {ytProcessing
                    ? `Processing ${ytProgress.done + 1} of ${ytProgress.total}…`
                    : `Generate ${ytUrls.length > 0 ? ytUrls.length : ""} Exercise${ytUrls.length === 1 ? "" : "s"}`
                  }
                </Button>
              </div>

              {ytProcessing && (
                <div className="space-y-1">
                  <Progress value={ytProgressPct} className="h-1.5" />
                  <p className="text-xs text-muted-foreground">
                    AI is analyzing each video and generating clinical metadata… this takes a few seconds per video.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <Youtube className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Works best with exercise-specific YouTube videos — the video title is used to generate the exercise name and all clinical details. Videos like &ldquo;Seated Knee Extension — Senior Physical Therapy&rdquo; produce excellent results.
            </p>
          </div>
        </div>
      )}

      {/* ── Playlist panel ── */}
      {mode === "playlist" && (
        <div className="space-y-4">
          <div className="rounded-xl border bg-background shadow-sm">
            <div className="border-b px-5 py-4">
              <p className="font-medium">Import from YouTube Playlist</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Paste a playlist URL — all videos will be fetched so you can select which ones to turn into exercises.
              </p>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="https://www.youtube.com/playlist?list=PLxxxxxxxx"
                  value={playlistUrl}
                  onChange={(e) => {
                    setPlaylistUrl(e.target.value);
                    if (playlistVideos.length) {
                      setPlaylistVideos([]);
                      setSelectedVideoIds(new Set());
                    }
                  }}
                  className="font-mono text-sm"
                  disabled={playlistLoading || ytProcessing}
                />
                <Button
                  onClick={fetchPlaylist}
                  disabled={!playlistUrl.trim() || playlistLoading || ytProcessing}
                  variant="outline"
                >
                  {playlistLoading
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <ListVideo className="mr-2 h-4 w-4" />
                  }
                  {playlistLoading ? "Fetching…" : "Fetch Videos"}
                </Button>
              </div>

              {/* Video selection grid */}
              {playlistVideos.length > 0 && (
                <div className="space-y-3">
                  <VideoSelectionGrid
                    videos={playlistSelectableVideos}
                    selectedIds={selectedVideoIds}
                    onToggle={toggleVideoSelection}
                    onSelectAll={selectAllVideos}
                    onDeselectAll={deselectAllVideos}
                    maxSelectable={30}
                    disabled={ytProcessing}
                  />

                  {ytProcessing && (
                    <div className="space-y-1">
                      <Progress value={ytProgressPct} className="h-1.5" />
                      <p className="text-xs text-muted-foreground">
                        AI is analyzing each video and generating clinical metadata… this takes a few seconds per video.
                        {ytProgress.total > 0 && ` (${ytProgress.done} of ${ytProgress.total})`}
                      </p>
                    </div>
                  )}

                  <Button
                    onClick={processPlaylistSelection}
                    disabled={selectedCount === 0 || selectedCount > 30 || ytProcessing}
                    className="w-full"
                  >
                    {ytProcessing
                      ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      : <Sparkles className="mr-2 h-4 w-4" />
                    }
                    {ytProcessing
                      ? `Processing ${ytProgress.done + 1} of ${ytProgress.total}…`
                      : `Generate ${selectedCount > 0 ? selectedCount : ""} Exercise${selectedCount === 1 ? "" : "s"}`
                    }
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            <ListVideo className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Playlists can contain up to 200 videos. Use the checkboxes to select which videos to import — AI will generate full clinical metadata for each selected video.
            </p>
          </div>
        </div>
      )}

      {/* ── Search panel ── */}
      {mode === "search" && (
        <div className="space-y-4">
          <div className="rounded-xl border bg-background shadow-sm">
            <div className="border-b px-5 py-4">
              <p className="font-medium">Discover Exercises from YouTube</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Describe a niche or goal — we&apos;ll search YouTube for candidate videos so you can pick which ones to turn into exercises.
              </p>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. marathon runner strength exercises"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runSearch(); } }}
                  className="text-sm"
                  disabled={searchLoading || ytProcessing}
                />
                <Button
                  onClick={runSearch}
                  disabled={!searchQuery.trim() || searchLoading || ytProcessing}
                  variant="outline"
                >
                  {searchLoading
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <Search className="mr-2 h-4 w-4" />
                  }
                  {searchLoading ? "Searching…" : "Search"}
                </Button>
              </div>

              {/* Video selection grid */}
              {searchVideos.length > 0 && (
                <div className="space-y-3">
                  <VideoSelectionGrid
                    videos={searchSelectableVideos}
                    selectedIds={selectedSearchVideoIds}
                    onToggle={toggleSearchVideoSelection}
                    onSelectAll={selectAllSearchVideos}
                    onDeselectAll={deselectAllSearchVideos}
                    maxSelectable={30}
                    disabled={ytProcessing}
                  />

                  {ytProcessing && (
                    <div className="space-y-1">
                      <Progress value={ytProgressPct} className="h-1.5" />
                      <p className="text-xs text-muted-foreground">
                        AI is analyzing each video and generating metadata… this takes a few seconds per video.
                        {ytProgress.total > 0 && ` (${ytProgress.done} of ${ytProgress.total})`}
                      </p>
                    </div>
                  )}

                  <Button
                    onClick={processSearchSelection}
                    disabled={searchSelectedCount === 0 || searchSelectedCount > 30 || ytProcessing}
                    className="w-full"
                  >
                    {ytProcessing
                      ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      : <Sparkles className="mr-2 h-4 w-4" />
                    }
                    {ytProcessing
                      ? `Processing ${ytProgress.done + 1} of ${ytProgress.total}…`
                      : `Generate ${searchSelectedCount > 0 ? searchSelectedCount : ""} Exercise${searchSelectedCount === 1 ? "" : "s"}`
                    }
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <Search className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Search results aren&apos;t curated — expect some irrelevant videos mixed in (vlogs, interviews, nutrition content). Nothing is pre-selected; review titles and channels before checking the ones worth importing.
            </p>
          </div>
        </div>
      )}

      {/* ── Exercise cards ── */}
      {rows.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">
                Review & Edit — {rows.length} Exercise{rows.length === 1 ? "" : "s"}
              </h3>
              <p className="text-sm text-muted-foreground">
                AI-filled fields are editable. At minimum each exercise needs a name, body region, and difficulty.
              </p>
            </div>
            <div className="flex gap-2">
            </div>
          </div>

          <div className="space-y-3">
            {rows.map((row, index) => (
              <ExerciseRowCard
                key={row.rowId}
                row={row}
                index={index}
                onUpdate={(patch) => updateRow(row.rowId, patch)}
                onRemove={() => removeRow(row.rowId)}
                onGenerate={() => generateMetadata(row.rowId)}
                onToggleEquipment={(item) => toggleEquipment(row.rowId, item)}
                onToggleBodyRegion={(region) => toggleBodyRegion(row.rowId, region)}
              />
            ))}
          </div>

          {/* Sticky publish bar */}
          <div className="sticky bottom-4 z-10">
            <div className="flex items-center justify-between rounded-xl border bg-background px-5 py-4 shadow-lg">
              <div>
                <p className="font-semibold">
                  {readyCount} of {rows.length} ready to publish
                </p>
                <p className="text-xs text-muted-foreground">
                  Needs name + body region + difficulty
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => router.back()} disabled={publishing}>Cancel</Button>
                <Button onClick={handlePublish} disabled={publishing || readyCount === 0 || ytProcessing}>
                  {publishing
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <CheckCircle2 className="mr-2 h-4 w-4" />
                  }
                  Publish {readyCount > 0 ? readyCount : ""} Exercise{readyCount === 1 ? "" : "s"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Row card ────────────────────────────────────────────────────────────────

interface RowProps {
  row: ExerciseRow;
  index: number;
  onUpdate: (patch: Partial<ExerciseRow>) => void;
  onRemove: () => void;
  onGenerate: () => void;
  onToggleEquipment: (item: string) => void;
  onToggleBodyRegion: (region: string) => void;
}

function ExerciseRowCard({ row, index, onUpdate, onRemove, onGenerate, onToggleEquipment, onToggleBodyRegion }: RowProps) {
  const isReady = !!(row.name.trim() && row.bodyRegion.length > 0 && row.difficultyLevel);
  const isYT = isYouTubeUrl(row.videoUrl);

  return (
    <div className={`rounded-xl border bg-background shadow-sm transition-colors ${isReady ? "border-green-200" : ""}`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
          {index + 1}
        </span>
        {isYT ? (
          <Youtube className="h-4 w-4 shrink-0 text-red-500" />
        ) : (
          <Video className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <p className="flex-1 truncate text-sm text-muted-foreground">{row.videoFileName || row.videoUrl}</p>
        {isReady && <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />}
        {row.isAssessment && (
          <Badge variant="outline" className="shrink-0 gap-1 border-blue-300 bg-blue-50 text-xs text-blue-700">
            <ClipboardCheck className="h-3 w-3" /> Assessment
          </Badge>
        )}
        {row.aiStatus === "done" && (
          <Badge variant="secondary" className="shrink-0 gap-1 text-xs">
            <Sparkles className="h-3 w-3" /> AI filled
          </Badge>
        )}
        {row.aiStatus === "error" && (
          <Badge variant="destructive" className="shrink-0 gap-1 text-xs">
            <AlertCircle className="h-3 w-3" /> Retry AI
          </Badge>
        )}
        <button type="button" onClick={() => onUpdate({ expanded: !row.expanded })} className="rounded p-1 text-muted-foreground hover:text-foreground">
          {row.expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <button type="button" onClick={onRemove} className="rounded p-1 text-muted-foreground hover:text-destructive">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Name + AI button */}
      <div className="flex gap-2 border-t px-4 py-3">
        <Input
          placeholder="Exercise name"
          value={row.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          className="flex-1"
        />
        <Button
          type="button"
          variant={row.aiStatus === "done" ? "secondary" : "outline"}
          onClick={onGenerate}
          disabled={row.aiStatus === "loading" || !row.name.trim()}
          className="shrink-0"
        >
          {row.aiStatus === "loading"
            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            : <Sparkles className="mr-2 h-4 w-4" />}
          {row.aiStatus === "loading" ? "Generating…" : row.aiStatus === "done" ? "Regenerate" : "AI Generate"}
        </Button>
      </div>

      {/* Expanded fields */}
      {row.expanded && (
        <div className="space-y-4 border-t px-4 pb-5 pt-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Body Region *</Label>
            <div className="flex flex-wrap gap-1.5">
              {BODY_REGIONS.map((r) => {
                const active = row.bodyRegion.includes(r.value);
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => onToggleBodyRegion(r.value)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:border-primary/60 hover:text-foreground"
                    }`}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Difficulty *</Label>
              <select value={row.difficultyLevel} onChange={(e) => onUpdate({ difficultyLevel: e.target.value })} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Select…</option>
                {DIFFICULTY_LEVELS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label className="text-xs font-medium">Phase(s)</Label>
              <div className="flex flex-wrap gap-1.5">
                {EXERCISE_PHASES.map((p) => {
                  const active = row.exercisePhases.includes(p.value);
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => onUpdate({
                        exercisePhases: active
                          ? row.exercisePhases.filter((v) => v !== p.value)
                          : [...row.exercisePhases, p.value],
                      })}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-muted-foreground border-border hover:border-primary/60 hover:text-foreground"
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Assessment exercise toggle */}
          <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50/60 p-3">
            <Checkbox
              id={`isAssessment-${row.rowId}`}
              checked={row.isAssessment}
              onCheckedChange={(checked) => onUpdate({ isAssessment: checked === true })}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <Label htmlFor={`isAssessment-${row.rowId}`} className="flex items-center gap-1.5 text-xs font-medium">
                <ClipboardCheck className="h-3.5 w-3.5 text-blue-600" />
                Assessment exercise
              </Label>
              <p className="text-xs text-muted-foreground">
                Evaluates a client (e.g. a movement screen or timed test) rather than trains them —
                excluded from AI-generated programs and the add-exercise picker.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Sets</Label>
              <Input type="number" min={1} max={10} value={row.defaultSets} onChange={(e) => onUpdate({ defaultSets: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Reps</Label>
              <Input type="number" min={1} max={60} value={row.defaultReps} onChange={(e) => onUpdate({ defaultReps: e.target.value })} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Description</Label>
            <Textarea rows={2} value={row.description} onChange={(e) => onUpdate({ description: e.target.value })} placeholder="Clinical description" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Instructions</Label>
            <Textarea rows={3} value={row.instructions} onChange={(e) => onUpdate({ instructions: e.target.value })} placeholder="Step-by-step client instructions" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Muscles Targeted <span className="font-normal text-muted-foreground">(comma separated)</span></Label>
            <Input value={row.musclesTargeted} onChange={(e) => onUpdate({ musclesTargeted: e.target.value })} placeholder="e.g. Quadriceps, Glutes, Hamstrings" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Equipment Required</Label>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_EQUIPMENT.map((eq) => (
                <button
                  key={eq}
                  type="button"
                  onClick={() => onToggleEquipment(eq)}
                  className={[
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    row.equipmentRequired.includes(eq)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground",
                  ].join(" ")}
                >
                  {eq}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Contraindications <span className="font-normal text-muted-foreground">(comma separated)</span></Label>
            <Input value={row.contraindications} onChange={(e) => onUpdate({ contraindications: e.target.value })} placeholder="e.g. Acute knee injury, Recent hip replacement" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Common Mistakes</Label>
            <Textarea rows={2} value={row.commonMistakes} onChange={(e) => onUpdate({ commonMistakes: e.target.value })} placeholder="Frequent form errors and corrections" />
          </div>
        </div>
      )}
    </div>
  );
}
