import { type NextRequest } from "next/server";
import sharp from "sharp";

import { getClusterColorById } from "@/lib/clusters/colors";

// Public, unauthenticated PNG of a cluster's Lucide cube icon, colored by the
// SAME `getClusterColorById` the UI uses. Slack (and other image consumers)
// fetch this server-side, so the URL carries only the cluster id + leaf flag —
// the color logic stays solely in `lib/clusters/colors.ts` (single source of truth).
//
// We hand-author the SVG from Lucide's `box`/`boxes` path data instead of rendering
// the React icon component: importing `react-dom/server` into a route handler is
// disallowed by the Next.js App Router (and pulls a needless server-render dep).
// Slack rejects SVG image URLs, so we rasterize to PNG with sharp.
export const runtime = "nodejs"; // sharp needs the Node runtime, not Edge.

// Lucide v0.468.0 path data (github.com/lucide-icons/lucide, ISC license). Keep in sync
// with lucide-react's `Box`/`Boxes` if the dependency is bumped.
const BOX_PATHS = [
  "M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z",
  "m3.3 7 8.7 5 8.7-5",
  "M12 22V12",
];
const BOXES_PATHS = [
  "M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z",
  "m7 16.5-4.74-2.85",
  "m7 16.5 5-3",
  "M7 16.5v5.17",
  "M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z",
  "m17 16.5-5-3",
  "m17 16.5 4.74-2.85",
  "M17 16.5v5.17",
  "M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z",
  "M12 8 7.26 5.15",
  "m12 8 4.74-2.85",
  "M12 13.5V8",
];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const clusterId = searchParams.get("clusterId");
  // Non-leaf clusters (with children) render as stacked "boxes"; leaves as a single "box".
  const variant = searchParams.get("variant") === "boxes" ? "boxes" : "box";
  const size = Math.min(Math.max(parseInt(searchParams.get("size") ?? "64", 10) || 64, 16), 256);

  const color = getClusterColorById(clusterId);
  const paths = variant === "boxes" ? BOXES_PATHS : BOX_PATHS;
  // Match cluster-icon.tsx: fill = color@10%, stroke = color@70%, strokeWidth 1 (boxes) / 1.5 (box).
  const strokeWidth = variant === "boxes" ? 1 : 1.5;
  const body = paths.map((d) => `<path d="${d}" />`).join("");
  // `color` is a palette hex from getClusterColorById, so it's safe to interpolate directly.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    `fill="${color}" fill-opacity="0.1" stroke="${color}" stroke-opacity="0.7" ` +
    `stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

  try {
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    return new Response(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        // Stable per (clusterId, variant). No `immutable`: a HASH_SALT bump changes
        // the color for the same URL, so allow CDNs to revalidate after max-age
        // rather than pinning the old color for a full day.
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    // sharp/librsvg can throw (missing lib, unparseable SVG, OOM). A 500 makes Slack
    // render a broken-image icon for the whole notification; instead degrade to a 1x1
    // transparent PNG (200) with no caching so it recovers on the next fetch.
    console.error("[cluster-swatch] sharp render failed:", error);
    const blank = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );
    return new Response(new Uint8Array(blank), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  }
}
