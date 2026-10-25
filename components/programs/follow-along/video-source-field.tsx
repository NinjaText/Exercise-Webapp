"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Film, Link2, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { generateFollowAlongVideoUploadUrlAction } from "@/actions/follow-along-actions";
import { isYouTubeUrl } from "@/lib/utils/video";
import { readYouTubeDuration } from "@/lib/utils/youtube-iframe-api";
import { readLocalVideoDuration, uploadWithProgress } from "@/lib/utils/upload-with-progress";
import { formatDuration, getYouTubeVideoId, MAX_FOLLOW_ALONG_VIDEO_BYTES } from "@/lib/utils/follow-along";
import {
  FOLLOW_ALONG_VIDEO_CONTENT_TYPES,
  type FollowAlongVideoContentType,
} from "@/lib/validators/follow-along";

export interface VideoSourceValue {
  videoUrl: string | null;
  videoDurationSec: number | null;
}

interface VideoSourceFieldProps {
  id: string;
  value: VideoSourceValue;
  onChange: (next: VideoSourceValue) => void;
  /** Lets the editor block saving while an upload is still running. */
  onUploadingChange?: (uploading: boolean) => void;
}

type SourceMode = "upload" | "youtube";

/**
 * Pick a follow-along video: upload a file to R2 (with a progress bar) or
 * paste a YouTube link. The duration is read automatically — from the file's
 * metadata or the YouTube player — and the minutes field stays editable as
 * the fallback when it can't be read.
 */
export function VideoSourceField({ id, value, onChange, onUploadingChange }: VideoSourceFieldProps) {
  const [mode, setMode] = useState<SourceMode>(value.videoUrl && isYouTubeUrl(value.videoUrl) ? "youtube" : "upload");
  const [youTubeInput, setYouTubeInput] = useState(value.videoUrl && isYouTubeUrl(value.videoUrl) ? value.videoUrl : "");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [readingDuration, setReadingDuration] = useState(false);
  const [minutesInput, setMinutesInput] = useState(value.videoDurationSec ? String(Math.round(value.videoDurationSec / 60)) : "");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // A navigation away mid-upload shouldn't leave the XHR running.
  useEffect(() => () => abortRef.current?.abort(), []);

  const uploading = uploadProgress !== null;
  const hasUploadedFile = !!value.videoUrl && !isYouTubeUrl(value.videoUrl);

  function emit(next: VideoSourceValue) {
    onChange(next);
    setMinutesInput(next.videoDurationSec ? String(Math.round(next.videoDurationSec / 60)) : "");
  }

  async function handleFile(file: File) {
    if (!FOLLOW_ALONG_VIDEO_CONTENT_TYPES.includes(file.type as FollowAlongVideoContentType)) {
      toast.error("Choose an MP4, WebM, or MOV video");
      return;
    }
    if (file.size > MAX_FOLLOW_ALONG_VIDEO_BYTES) {
      toast.error("Videos can be at most 2 GB");
      return;
    }

    const durationPromise = readLocalVideoDuration(file);
    const presign = await generateFollowAlongVideoUploadUrlAction({
      contentType: file.type as FollowAlongVideoContentType,
      fileSize: file.size,
    });
    if (!presign.success || !presign.data) {
      toast.error(presign.error ?? "Couldn't start the upload");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setUploadProgress(0);
    onUploadingChange?.(true);
    try {
      await uploadWithProgress(presign.data.presignedUrl, file, presign.data.contentType, {
        onProgress: setUploadProgress,
        signal: controller.signal,
      });
      const durationSec = await durationPromise;
      emit({ videoUrl: presign.data.fileUrl, videoDurationSec: durationSec ?? value.videoDurationSec });
      if (!durationSec) toast.info("Couldn't read the video length — enter the minutes manually");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        toast.error(error instanceof Error ? error.message : "Upload failed");
      }
    } finally {
      abortRef.current = null;
      setUploadProgress(null);
      onUploadingChange?.(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function applyYouTubeUrl() {
    const url = youTubeInput.trim();
    if (!url) {
      emit({ videoUrl: null, videoDurationSec: null });
      return;
    }
    const videoId = getYouTubeVideoId(url);
    if (!isYouTubeUrl(url) || !videoId) {
      toast.error("That doesn't look like a YouTube video link");
      return;
    }
    if (url === value.videoUrl) return;
    setReadingDuration(true);
    const durationSec = await readYouTubeDuration(videoId);
    setReadingDuration(false);
    emit({ videoUrl: url, videoDurationSec: durationSec ?? value.videoDurationSec });
    if (!durationSec) toast.info("Couldn't read the video length — enter the minutes manually");
  }

  function handleMinutesChange(raw: string) {
    setMinutesInput(raw);
    const minutes = Number(raw);
    onChange({
      ...value,
      videoDurationSec: raw.trim() && Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : null,
    });
  }

  return (
    <div className="space-y-3">
      <Tabs value={mode} onValueChange={(v) => setMode(v as SourceMode)}>
        <TabsList>
          <TabsTrigger value="upload" disabled={uploading}>
            <Upload className="size-3.5" /> Upload
          </TabsTrigger>
          <TabsTrigger value="youtube" disabled={uploading}>
            <Link2 className="size-3.5" /> YouTube link
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {mode === "upload" ? (
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            id={`${id}-file`}
            type="file"
            accept={FOLLOW_ALONG_VIDEO_CONTENT_TYPES.join(",")}
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          {uploading ? (
            <div className="space-y-2 rounded-lg bg-surface-muted p-3 ring-1 ring-border">
              <div className="flex items-center justify-between gap-2 text-caption">
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="size-3.5 animate-spin" /> Uploading… {Math.round((uploadProgress ?? 0) * 100)}%
                </span>
                <Button type="button" variant="ghost" size="xs" onClick={() => abortRef.current?.abort()}>
                  Cancel
                </Button>
              </div>
              <Progress value={Math.round((uploadProgress ?? 0) * 100)} />
            </div>
          ) : hasUploadedFile ? (
            <div className="flex items-center gap-2 rounded-lg bg-success-soft p-3 text-body text-success-foreground ring-1 ring-success-border">
              <CheckCircle2 className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate">Video uploaded</span>
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                Replace
              </Button>
            </div>
          ) : (
            <Button type="button" variant="outline" className="h-11 w-full justify-start" onClick={() => fileInputRef.current?.click()}>
              <Film className="size-4" />
              Choose a video (MP4, WebM, MOV · up to 2 GB)
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-youtube`} className="sr-only">
            YouTube link
          </Label>
          <div className="flex gap-2">
            <Input
              id={`${id}-youtube`}
              type="url"
              inputMode="url"
              placeholder="https://www.youtube.com/watch?v=…"
              value={youTubeInput}
              onChange={(e) => setYouTubeInput(e.target.value)}
              onBlur={() => void applyYouTubeUrl()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void applyYouTubeUrl();
                }
              }}
            />
            {value.videoUrl && isYouTubeUrl(value.videoUrl) && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove video"
                onClick={() => {
                  setYouTubeInput("");
                  emit({ videoUrl: null, videoDurationSec: null });
                }}
              >
                <X className="size-4" />
              </Button>
            )}
          </div>
          {readingDuration && (
            <p className="inline-flex items-center gap-1.5 text-caption">
              <Loader2 className="size-3.5 animate-spin" /> Reading video length…
            </p>
          )}
        </div>
      )}

      <div className="flex items-end gap-3">
        <div className="w-32 space-y-1.5">
          <Label htmlFor={`${id}-minutes`}>Length (min)</Label>
          <Input
            id={`${id}-minutes`}
            type="number"
            inputMode="decimal"
            min={1}
            max={720}
            step={1}
            value={minutesInput}
            onChange={(e) => handleMinutesChange(e.target.value)}
          />
        </div>
        {value.videoDurationSec ? (
          <p className="pb-2 text-caption">{formatDuration(value.videoDurationSec)}</p>
        ) : null}
      </div>
    </div>
  );
}
