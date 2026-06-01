"use client";

import { type ReactNode } from "react";

import {
  createHeatmapStyle,
  getHeatmapColor,
  getHeatmapPosition,
  type HeatmapVariant,
} from "@/components/evaluation/utils";
import { type ScoreRange } from "@/lib/colors";

interface HeatmapValueProps {
  value: number;
  range: ScoreRange;
  variant: HeatmapVariant;
  // The value text node. Callers control its font (Mono vs default) so the
  // heatmap shell stays presentation-only.
  text: ReactNode;
}

export default function HeatmapValue({ value, range, variant, text }: HeatmapValueProps) {
  const color = getHeatmapColor(value, range);
  if (!color) return <>{text}</>;

  switch (variant) {
    case "pill": {
      // Pill keeps the optimal text-color logic from the original implementation
      // so the value stays legible on top of a saturated background.
      const style = createHeatmapStyle(value, range);
      return (
        <span
          className="inline-block whitespace-nowrap rounded px-1 py-0.5 text-center text-xs"
          style={style}
        >
          {text}
        </span>
      );
    }
    case "square":
      return (
        <div className="flex items-center gap-1.5">
          <span className="size-2 shrink-0 rounded-sm" style={{ background: color }} />
          {text}
        </div>
      );
    case "bar":
      return (
        <div className="flex h-full items-stretch gap-2">
          <span className="w-1 shrink-0 self-stretch rounded-sm" style={{ background: color }} />
          <span className="flex items-center">{text}</span>
        </div>
      );
    case "text":
      return <span style={{ color }}>{text}</span>;
    case "progress": {
      const pos = getHeatmapPosition(value, range);
      return (
        <div className="flex min-w-[3rem] flex-col gap-0.5">
          <div>{text}</div>
          <div className="h-1 w-full overflow-hidden rounded-sm bg-muted">
            <div className="h-full" style={{ width: `${pos * 100}%`, background: color }} />
          </div>
        </div>
      );
    }
  }
}
