/**
 * Extracts a YouTube video ID from various YouTube URL formats.
 * Supports:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://youtube.com/shorts/VIDEO_ID
 */
const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]+$/;

function isValidYouTubeId(id: string | null): id is string {
  return id !== null && id.length > 0 && YOUTUBE_ID_RE.test(id);
}

export function extractYouTubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");

    if (host === "youtube.com" || host === "m.youtube.com") {
      if (parsed.pathname === "/watch") {
        const v = parsed.searchParams.get("v");
        return isValidYouTubeId(v) ? v : null;
      }
      const embedOrShortsMatch = parsed.pathname.match(/^\/(embed|shorts)\/([^/]+)/);
      if (embedOrShortsMatch && isValidYouTubeId(embedOrShortsMatch[2])) {
        return embedOrShortsMatch[2];
      }
    }

    if (host === "youtu.be") {
      const id = parsed.pathname.slice(1).split("/")[0];
      return isValidYouTubeId(id) ? id : null;
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
