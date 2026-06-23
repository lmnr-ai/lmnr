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
          <TooltipTrigger asChild>
            <button
              className={cn(
                "flex items-center gap-0.5 h-[24px] px-1.5 rounded-md bg-muted text-xs text-muted-foreground hover:bg-secondary transition-colors border",
                isCostHeatmapVisible && "border-primary/50 text-primary bg-muted"
              )}
              onClick={() => onToggleCostHeatmap(!isCostHeatmapVisible)}
            >
              <DollarSign className="size-3" />
              <span>Cost heatmap</span>
            </button>
          </TooltipTrigger>
          <TooltipContent className="border">Toggle cost heatmap</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <div className="flex items-center border rounded-md bg-muted px-0.5 h-[24px]">
        <Button disabled={zoom >= MAX_ZOOM} className="size-5 min-w-5" variant="ghost" size="icon" onClick={onZoomIn}>
          <Plus className="size-3" />
        </Button>
        <Button disabled={zoom <= MIN_ZOOM} className="size-5 min-w-5" variant="ghost" size="icon" onClick={onZoomOut}>
          <Minus className="size-3" />
        </Button>
      </div>
    </div>
  );
}
