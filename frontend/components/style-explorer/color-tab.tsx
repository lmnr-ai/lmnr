"use client";

// TEMPORARY style exploration tooling — safe to delete this folder + the mount in layout.tsx.
// Composes the surface curve editor, endpoint controls, preview chips, and the Save button.

import { Button } from "@/components/ui/button";

import EndpointControls from "./endpoint-controls";
import { useStyleContext } from "./style-context";
import SurfaceChips from "./surface-chips";
import SurfaceCurveEditor from "./surface-curve-editor";

export default function ColorTab() {
  const { applyToDocument, interpolatePoints } = useStyleContext();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-foreground">Surface curve</div>
          <Button variant="outline" size="sm" onClick={interpolatePoints}>
            Interpolate
          </Button>
        </div>
        <div className="text-[11px] text-muted-foreground">Drag points: X = chroma/hue blend, Y = lightness.</div>
        <SurfaceCurveEditor />
      </div>
      <EndpointControls />
      <div className="flex flex-col gap-2">
        <div className="text-xs font-medium text-foreground">Surface stops</div>
        <SurfaceChips />
      </div>
      <Button variant="default" size="md" onClick={applyToDocument} className="w-full">
        Save (apply to app)
      </Button>
    </div>
  );
}
