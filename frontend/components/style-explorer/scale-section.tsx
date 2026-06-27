"use client";

// TEMPORARY style exploration tooling — safe to delete this folder + the mount in layout.tsx.
// One editable color scale: curve editor + Interpolate + endpoint controls + preview chips.

import { Button } from "@/components/ui/button";

import CurveEditor from "./curve-editor";
import EndpointControls from "./endpoint-controls";
import ScaleChips from "./scale-chips";
import { useStyleContext } from "./style-context";
import type { CurveKey } from "./tokens";

export default function ScaleSection({
  curve,
  title,
  chipsLabel,
}: {
  curve: CurveKey;
  title: string;
  chipsLabel: string;
}) {
  const { interpolatePoints } = useStyleContext();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-foreground">{title}</div>
          <Button variant="outline" size="sm" onClick={() => interpolatePoints(curve)}>
            Interpolate
          </Button>
        </div>
        <div className="text-[11px] text-muted-foreground">Drag points: X = chroma/hue blend, Y = lightness.</div>
        <CurveEditor curve={curve} />
      </div>
      <EndpointControls curve={curve} />
      <div className="flex flex-col gap-2">
        <div className="text-xs font-medium text-foreground">{chipsLabel}</div>
        <ScaleChips curve={curve} />
      </div>
    </div>
  );
}
