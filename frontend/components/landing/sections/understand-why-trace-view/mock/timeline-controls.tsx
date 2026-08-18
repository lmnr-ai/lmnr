"use client";

import { DollarSign, Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useElevation } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

interface Props {
  /** The bounds as booleans, not the zoom level: the chips only ever ask
   *  whether the buttons are live, so they need none of ./timeline's scale. */
  canZoomIn: boolean;
  canZoomOut: boolean;
  onZoom: (direction: "in" | "out") => void;
  heatmap: boolean;
  onToggleHeatmap: () => void;
}

// The chips floating over the bottom-right of the timeline.
//
// Its own component so `useElevation` reads the surface it is INSIDE. Called in
// ./timeline, which is where the <ElevatedSurface> itself is, it would resolve
// against the ambient level OUTSIDE that surface and the chips would paint a
// step too low.
const TimelineControls = ({ canZoomIn, canZoomOut, onZoom, heatmap, onToggleHeatmap }: Props) => {
  const { className: raisedSurface } = useElevation({ offset: 2 });

  return (
    <div className="absolute bottom-1.5 right-1.5 z-40 flex items-center gap-1 h-[24px]">
      <button
        onClick={onToggleHeatmap}
        className={cn(
          "flex items-center gap-0.5 h-[24px] px-1.5 rounded-md text-xs text-muted-foreground hover:bg-surface-up-2 transition-colors border",
          raisedSurface,
          heatmap && "border-primary/50 text-primary"
        )}
      >
        <DollarSign className="size-3" />
        <span>Cost heatmap</span>
      </button>
      <div className={cn("flex items-center border rounded-md px-0.5 h-[24px]", raisedSurface)}>
        <Button
          aria-label="Zoom in"
          disabled={!canZoomIn}
          className="size-5 min-w-5"
          variant="ghost"
          size="icon"
          onClick={() => onZoom("in")}
        >
          <Plus className="size-3" />
        </Button>
        <Button
          aria-label="Zoom out"
          disabled={!canZoomOut}
          className="size-5 min-w-5"
          variant="ghost"
          size="icon"
          onClick={() => onZoom("out")}
        >
          <Minus className="size-3" />
        </Button>
      </div>
    </div>
  );
};

export default TimelineControls;
