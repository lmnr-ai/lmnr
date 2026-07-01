import { Box, Boxes } from "lucide-react";
import { type NextRequest } from "next/server";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";

import { getClusterColorById } from "@/lib/clusters/colors";

// Public, unauthenticated PNG of a cluster's Lucide cube icon, colored by the
// SAME `getClusterColorById` the UI uses. Slack (and other image consumers)
// fetch this server-side, so the URL carries only the cluster id + leaf flag —
// the color logic stays solely in `lib/clusters/colors.ts` (single source of truth).
// Slack rejects SVG image URLs, so we rasterize to PNG with sharp.
export const runtime = "nodejs"; // sharp needs the Node runtime, not Edge.

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const clusterId = searchParams.get("clusterId");
  // Non-leaf clusters (with children) render as stacked "boxes"; leaves as a single "box".
  const variant = searchParams.get("variant") === "boxes" ? "boxes" : "box";
  const size = Math.min(Math.max(parseInt(searchParams.get("size") ?? "64", 10) || 64, 16), 256);

  const color = getClusterColorById(clusterId);
  const Icon = variant === "boxes" ? Boxes : Box;
  // Match cluster-icon.tsx: fill = color@10%, stroke = color@70%, strokeWidth 1 (boxes) / 1.5 (box).
  // SVG fill-opacity/stroke-opacity inherit to the icon paths, so the hex color goes in directly.
  const svg = renderToStaticMarkup(
    createElement(Icon, {
      width: size,
      height: size,
      fill: color,
      fillOpacity: 0.1,
      stroke: color,
      strokeOpacity: 0.7,
      strokeWidth: variant === "boxes" ? 1 : 1.5,
    })
  );

  const png = await sharp(Buffer.from(svg)).png().toBuffer();

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      // Stable per (clusterId, variant); a HASH_SALT bump is the only thing that
      // changes the color, and that's a deliberate, rare global reskin.
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
