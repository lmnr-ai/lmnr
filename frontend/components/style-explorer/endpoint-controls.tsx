"use client";

// TEMPORARY style exploration tooling — safe to delete this folder + the mount in layout.tsx.
// Four numeric controls (cStart, hStart, cEnd, hEnd) driving the chroma/hue lerp.

import { Slider } from "@/components/ui/slider";

import { useStyleContext } from "./style-context";
import type { CurveKey, SurfaceEndpoints } from "./tokens";

const FIELDS: { key: keyof SurfaceEndpoints; label: string; min: number; max: number; step: number }[] = [
  { key: "cStart", label: "C start", min: 0, max: 0.3, step: 0.005 },
  { key: "hStart", label: "H start", min: 0, max: 360, step: 1 },
  { key: "cEnd", label: "C end", min: 0, max: 0.3, step: 0.005 },
  { key: "hEnd", label: "H end", min: 0, max: 360, step: 1 },
];

export default function EndpointControls({ curve }: { curve: CurveKey }) {
  const { state, setEndpoint } = useStyleContext();
  const { endpoints } = state[curve];

  return (
    <div className="grid grid-cols-2 gap-3">
      {FIELDS.map((f) => (
        <div key={f.key} className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{f.label}</span>
            <span className="tabular-nums">{endpoints[f.key]}</span>
          </div>
          <Slider
            value={[endpoints[f.key]]}
            min={f.min}
            max={f.max}
            step={f.step}
            onValueChange={(v) => setEndpoint(curve, f.key, v[0])}
          />
        </div>
      ))}
    </div>
  );
}
