import { DollarSign, Minus, Plus } from "lucide-react";

import { MAX_ZOOM, MIN_ZOOM } from "@/components/traces/trace-view/store";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  zoom: number;
  isCostHeatmapVisible: boolean;
  onToggleCostHeatmap: (visible: boolean) => void;
}

export default function Controls({
  onZoomIn,
  onZoomOut,
  zoom,
  isCostHeatmapVisible,
  onToggleCostHeatmap,
}: ControlsProps) {
  return (
    <div className="absolute bottom-1.5 right-1.5 z-40 flex items-center gap-1 h-[24px]">
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          {/* Opaque surface under an emphasis tint, matching the timeline toggle; the tint alone shows rows through. */}
          <div className="h-[24px] rounded-md bg-surface">
            <TooltipTrigger asChild>
              <button
                className={cn(
                  "flex h-full items-center gap-0.5 rounded-md border bg-emphasis-2 px-1.5 text-xs text-muted-foreground transition-colors hover:overlay-hover",
                  isCostHeatmapVisible && "border-primary/50 text-primary-text"
                )}
                onClick={() => onToggleCostHeatmap(!isCostHeatmapVisible)}
              >
                <DollarSign className="size-3" />
                <span>Cost heatmap</span>
              </button>
            </TooltipTrigger>
          </div>
          <TooltipContent>Toggle cost heatmap</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <div className="h-[24px] overflow-hidden rounded-md border bg-surface">
        <div className="flex h-full items-center bg-emphasis-2 px-0.5">
          <Button disabled={zoom >= MAX_ZOOM} className="min-w-5" variant="ghost" size="icon-xs" onClick={onZoomIn}>
            <Plus className="size-3" />
          </Button>
          <Button disabled={zoom <= MIN_ZOOM} className="min-w-5" variant="ghost" size="icon-xs" onClick={onZoomOut}>
            <Minus className="size-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
