import { activeUserOnly } from "@/lib/auth/active-user";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractYouTubePlaylistId } from "@/lib/utils/video";
import { isSuperAdmin } from "@/lib/current-user";

const MAX_VIDEOS = 200;

interface PlaylistItem {
  snippet: {
    title: string;
    description: string;
    position: number;
    thumbnails: {
      standard?: { url: string };
      high?: { url: string };
      medium?: { url: string };
      default?: { url: string };
    };
    resourceId: { videoId: string };
  };
}

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const dbUser = activeUserOnly(await prisma.user.findUnique({ where: { clerkId: userId } }));
    if (!dbUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isAdmin = await isSuperAdmin();
    if (dbUser.role !== "TRAINER" && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const playlistUrl = searchParams.get("url");
    if (!playlistUrl) {
      return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
    }

    const playlistId = extractYouTubePlaylistId(playlistUrl);
    if (!playlistId) {
      return NextResponse.json({ error: "Could not extract playlist ID from URL" }, { status: 400 });
    }

    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "YouTube API key not configured" }, { status: 500 });
    }

    const videos: Array<{
      videoId: string;
      title: string;
      thumbnailUrl: string;
      videoUrl: string;
      position: number;
    }> = [];

    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({
        part: "snippet",
        playlistId,
        maxResults: "50",
        key: apiKey,
        ...(pageToken ? { pageToken } : {}),
      });

      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?${params}`
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const message = err?.error?.message ?? "Failed to fetch playlist";
        return NextResponse.json({ error: message }, { status: 400 });
      }

      const data = await res.json();

      if (!data.items?.length) break;

      for (const item of data.items as PlaylistItem[]) {
        const videoId = item.snippet.resourceId.videoId;
        // Skip deleted/private videos (they show up as "[Deleted video]")
        if (!videoId || item.snippet.title === "[Deleted video]" || item.snippet.title === "[Private video]") {
          continue;
        }

        const thumbnail =
          item.snippet.thumbnails?.standard?.url ??
          item.snippet.thumbnails?.high?.url ??
          item.snippet.thumbnails?.medium?.url ??
          item.snippet.thumbnails?.default?.url ??
          "";

        videos.push({
          videoId,
          title: item.snippet.title,
          thumbnailUrl: thumbnail,
          videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
          position: item.snippet.position,
        });

        if (videos.length >= MAX_VIDEOS) break;
      }

      pageToken = videos.length < MAX_VIDEOS ? data.nextPageToken : undefined;
    } while (pageToken);

    return NextResponse.json({ videos, total: videos.length });
  } catch (error) {
    console.error("Failed to fetch playlist videos:", error);
    return NextResponse.json({ error: "Failed to fetch playlist" }, { status: 500 });
  }
}
