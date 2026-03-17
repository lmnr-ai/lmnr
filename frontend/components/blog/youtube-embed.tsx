/**
 * Extracts a YouTube video ID from various YouTube URL formats.
 * Supports:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://youtube.com/shorts/VIDEO_ID
 */
export function extractYouTubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace("www.", "");

    if (host === "youtube.com" || host === "m.youtube.com") {
      if (parsed.pathname === "/watch") {
        return parsed.searchParams.get("v");
      }
      const embedOrShortsMatch = parsed.pathname.match(/^\/(embed|shorts)\/([a-zA-Z0-9_-]+)/);
      if (embedOrShortsMatch) {
        return embedOrShortsMatch[2];
      }
    }

    if (host === "youtu.be") {
      return parsed.pathname.slice(1).split("/")[0] || null;
    }
  } catch {
    return null;
  }

  return null;
}

export default function YouTubeEmbed({ url }: { url: string }) {
  const videoId = extractYouTubeId(url);

  if (!videoId) {
    return (
      <a href={url} className="text-white underline hover:text-primary" target="_blank" rel="noopener noreferrer">
        {url}
      </a>
    );
  }

  return (
    <div className="pt-4">
      <div
        className="relative w-full overflow-hidden rounded-lg border border-white/10"
        style={{ paddingBottom: "56.25%" }}
      >
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${videoId}`}
          title="YouTube video player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    </div>
  );
}
