// components/exercises/youtube-video-search.tsx
"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { toast } from "sonner";

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
            <button
              key={v.videoId}
              type="button"
              onClick={() => onSelect(v)}
              className="flex flex-col text-left border rounded-md overflow-hidden hover:border-primary transition-colors"
            >
              {v.thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.thumbnailUrl} alt={v.title} className="w-full aspect-video object-cover" />
              )}
              <span className="text-[11px] font-medium px-1.5 py-1 line-clamp-2">{v.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
