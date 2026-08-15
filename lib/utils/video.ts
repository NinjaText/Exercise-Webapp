export function isYouTubeUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "www.youtube.com" ||
      parsed.hostname === "youtube.com" ||
      parsed.hostname === "youtu.be" ||
      parsed.hostname === "www.youtube-nocookie.com" ||
      parsed.hostname === "m.youtube.com"
    );
  } catch {
    return false;
  }
}

export function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);

    // youtu.be/VIDEO_ID
    if (parsed.hostname === "youtu.be") {
      return parsed.pathname.slice(1) || null;
    }

    // youtube.com/watch?v=VIDEO_ID
    const vParam = parsed.searchParams.get("v");
    if (vParam) return vParam;

    // youtube.com/embed/VIDEO_ID
    const embedMatch = parsed.pathname.match(/\/embed\/([^/?]+)/);
    if (embedMatch) return embedMatch[1];

    // youtube.com/shorts/VIDEO_ID
    const shortsMatch = parsed.pathname.match(/\/shorts\/([^/?]+)/);
    if (shortsMatch) return shortsMatch[1];

    return null;
  } catch {
    return null;
  }
}

export function getYouTubeThumbnail(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
}

export function getYouTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}`;
}

export function buildYouTubeSearchUrl(query: string): string {
  const params = new URLSearchParams({
    search_query: `${query} physical therapy exercise tutorial`,
  });
  return `https://www.youtube.com/results?${params.toString()}`;
}

export function extractYouTubePlaylistId(url: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (
      parsed.hostname !== "www.youtube.com" &&
      parsed.hostname !== "youtube.com" &&
      parsed.hostname !== "m.youtube.com"
    ) {
      return null;
    }
    return parsed.searchParams.get("list");
  } catch {
    return null;
  }
}

export function isYouTubePlaylistUrl(url: string): boolean {
  return extractYouTubePlaylistId(url) !== null;
}

export function hasRealVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (isYouTubeUrl(url)) return extractYouTubeId(url) !== null;
  return true; // non-YouTube URL (e.g. Vimeo) — assume real, no ID-extraction available
}

export function parseYoutubeUrls(raw: string): string[] {
  return raw
    .split(/[\n,\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && isYouTubeUrl(s) && !isYouTubePlaylistUrl(s));
}
