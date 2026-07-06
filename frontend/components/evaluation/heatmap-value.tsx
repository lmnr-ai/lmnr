"use client";

import { type ReactNode } from "react";

import { getHeatmapColor } from "@/components/evaluation/utils";
import { type ScoreRange } from "@/lib/colors";

interface HeatmapValueProps {
  value: number;
  range: ScoreRange;
  // The value text node. Callers control its font (Mono vs default) so the
  // heatmap shell stays presentation-only.
  text: ReactNode;
}

export default function HeatmapValue({ value, range, text }: HeatmapValueProps) {
  const color = getHeatmapColor(value, range);
  if (!color) return <>{text}</>;

  return (
    <div className="flex h-full items-stretch gap-2">
      <span className="w-1 shrink-0 self-stretch rounded-sm" style={{ background: color }} />
      <span className="flex items-center">{text}</span>
    </div>
  );
}
