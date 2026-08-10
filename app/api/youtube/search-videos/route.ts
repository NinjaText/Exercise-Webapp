import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/current-user";

// search.list costs 100 quota units per call vs. 1 unit for playlistItems.list/
// videos.list, so unlike the playlist route this fetches a single page only —
// no auto-pagination. Re-searching with different terms is the intended way
// to get a different set of results.
const MAX_RESULTS = 25;

interface SearchItem {
  id: { videoId: string };
  snippet: {
    title: string;
    channelTitle: string;
    thumbnails: {
      standard?: { url: string };
      high?: { url: string };
      medium?: { url: string };
      default?: { url: string };
    };
  };
}

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
    if (!dbUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isAdmin = await isSuperAdmin();
    if (dbUser.role !== "TRAINER" && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q")?.trim();
    if (!query) {
      return NextResponse.json({ error: "Missing q parameter" }, { status: 400 });
    }

    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "YouTube API key not configured" }, { status: 500 });
    }

    const params = new URLSearchParams({
      part: "snippet",
      type: "video",
      q: query,
      maxResults: String(MAX_RESULTS),
      key: apiKey,
    });

    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const message = err?.error?.message ?? "Failed to search YouTube";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const data = await res.json();

    const videos = ((data.items ?? []) as SearchItem[])
      .filter((item) => !!item.id?.videoId)
      .map((item) => {
        const videoId = item.id.videoId;
        const thumbnail =
          item.snippet.thumbnails?.standard?.url ??
          item.snippet.thumbnails?.high?.url ??
          item.snippet.thumbnails?.medium?.url ??
          item.snippet.thumbnails?.default?.url ??
          "";

        return {
          videoId,
          title: item.snippet.title,
          channelTitle: item.snippet.channelTitle,
          thumbnailUrl: thumbnail,
          videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
        };
      });

    return NextResponse.json({ videos, total: videos.length });
  } catch (error) {
    console.error("Failed to search YouTube videos:", error);
    return NextResponse.json({ error: "Failed to search YouTube" }, { status: 500 });
  }
}
