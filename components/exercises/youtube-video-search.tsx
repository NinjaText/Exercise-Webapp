// components/exercises/youtube-video-search.tsx
"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Search, Play, X } from "lucide-react";
import { toast } from "sonner";
import { UniversalVideoPlayer } from "@/components/exercises/universal-video-player";

interface Video {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  videoUrl: string;
}

interface Props {
  onSelect: (video: Video) => void;
}

export function YouTubeVideoSearch({ onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<Video | null>(null);

  async function runSearch() {
    if (!query.trim()) {
      toast.error("Enter an exercise name");
      return;
    }
    setLoading(true);
    setVideos([]);
    try {
      const res = await fetch(`/api/youtube/search-videos?q=${encodeURIComponent(query)}`);
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Search failed");
        return;
      }
      setVideos(json.videos);
      if (json.total === 0) toast.info("No videos found — try different search terms");
    } catch {
      toast.error("Search failed — try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. Single Leg RDL"
          className="h-8 text-sm flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              runSearch();
            }
          }}
        />
        <Button type="button" size="sm" className="h-8 text-xs shrink-0" disabled={loading} onClick={runSearch}>
          <Search className="h-3.5 w-3.5 mr-1" />
          {loading ? "Searching..." : "Search"}
        </Button>
      </div>
      {videos.length > 0 && (
        <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto">
          {videos.map((v) => (
            <div
              key={v.videoId}
              className="flex flex-col text-left border rounded-md overflow-hidden hover:border-primary transition-colors"
            >
              {v.thumbnailUrl && (
                <button
                  type="button"
                  onClick={() => setPreview(v)}
                  className="group relative block w-full"
                  title="Preview video"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={v.thumbnailUrl} alt={v.title} className="w-full aspect-video object-cover" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/40">
                    <Play className="h-5 w-5 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={() => onSelect(v)}
                className="text-[11px] font-medium px-1.5 py-1 line-clamp-2 text-left hover:bg-muted/60 transition-colors"
              >
                {v.title}
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null); }}>
        <DialogContent className="sm:max-w-xl gap-0 p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <p className="font-semibold text-sm truncate pr-4">{preview?.title}</p>
            <button onClick={() => setPreview(null)} className="shrink-0 rounded-md p-1 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="w-full bg-black">
            {preview?.videoUrl && <UniversalVideoPlayer url={preview.videoUrl} autoPlay />}
          </div>
          <div className="flex justify-end gap-2 px-4 py-3 border-t">
            <Button type="button" variant="outline" size="sm" onClick={() => setPreview(null)}>
              Close
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                if (preview) onSelect(preview);
                setPreview(null);
              }}
            >
              Use this video
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
