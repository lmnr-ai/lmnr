"use client";

// TEMPORARY style exploration tooling — safe to delete this folder + the mount in layout.tsx.
// Single slider for the flat translucent-white border alpha (--color-border, app-wide rim).

import { Slider } from "@/components/ui/slider";

import { useStyleContext } from "./style-context";

export default function BorderSection() {
  const { state, setBorderAlpha } = useStyleContext();

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-medium text-foreground">Border</div>
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Rim alpha (white)</span>
          <span className="tabular-nums">{state.borderAlpha.toFixed(2)}</span>
        </div>
        <Slider
          value={[state.borderAlpha]}
          min={0}
          max={0.4}
          step={0.01}
          onValueChange={(v) => setBorderAlpha(v[0])}
        />
      </div>
    </div>
  );
}
