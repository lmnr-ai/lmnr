"use client";

// TEMPORARY style exploration tooling — safe to delete this folder + the mount in layout.tsx.
// Live preview swatches for a scale's stops, recomputed from the curve state.

import { useStyleContext } from "./style-context";
import { computeSurfaceColor, type CurveKey } from "./tokens";

export default function ScaleChips({ curve }: { curve: CurveKey }) {
  const { state } = useStyleContext();
  const { points, endpoints } = state[curve];

  return (
    <div className="flex flex-col gap-1">
      {points.map((p) => {
        const color = computeSurfaceColor(p, endpoints);
        return (
          <div key={p.key} className="flex items-center gap-2 text-xs">
            <div className="size-6 shrink-0 rounded border border-border" style={{ backgroundColor: color }} />
            <span className="w-24 shrink-0 text-foreground">{p.key}</span>
            <span className="truncate font-mono text-muted-foreground">{color}</span>
          </div>
        );
      })}
    </div>
  );
}
