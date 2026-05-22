import { ArrowRight, Bot, Hexagon, MessageCircle } from "lucide-react";
import { type ReactNode } from "react";

import { type IconVariant } from "./cells";

// Shared styling for icon tiles, used both by the static grid (DiamondGrid)
// and by extended-diamond heads when a cell got picked as a variant tile.
// Keeping the maps in one place so the look stays consistent across both.

export const VARIANT_BG: Record<IconVariant, string> = {
  llm: "bg-llm",
  tool: "bg-yellow-500",
  input: "bg-blue-400",
  subagent: "bg-subagent",
};

// rotate(-90deg) is applied INSIDE the grid/head transform wrapper, so
// the glyph ends up 90° CCW relative to its current orientation in the
// tile plane — the parent's rotate(120) + skewX(-30) + scaleY(0.87)
// still wraps it.
const ICON_PROPS = { size: 14, className: "text-white -rotate-90" } as const;

export const VARIANT_ICON: Record<IconVariant, ReactNode> = {
  llm: <MessageCircle {...ICON_PROPS} />,
  tool: <Hexagon {...ICON_PROPS} />,
  input: <ArrowRight {...ICON_PROPS} />,
  subagent: <Bot {...ICON_PROPS} />,
};

export const TILE_SHELL = "flex items-center justify-center rounded-sm";
