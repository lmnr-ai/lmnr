import { MAX_ZOOM, MIN_ZOOM } from "@/components/traces/trace-view/store";
import { Button } from "@/components/ui/button";
import { DollarSign, Minus, Plus } from "@/components/ui/icon-lib";
import { borderVar, raiseVar, SURFACE_BG, useSurface } from "@/components/ui/surface";
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
  // Controls sit one level above the timeline surface they float over.
  const raised = Math.min(useSurface() + 1, 8);
  return (
    <div className={cn("absolute bottom-1.5 right-1.5 z-40 flex items-center gap-1 h-[24px]", raiseVar(raised), borderVar(raised))}>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={cn(
                "flex items-center gap-0.5 h-[24px] px-1.5 rounded-md text-xs text-muted-foreground hover:bg-[var(--surface-raise)] transition-colors border",
                SURFACE_BG[raised],
                isCostHeatmapVisible && "border-primary/50 text-primary"
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
      <div className={cn("flex items-center border rounded-md px-0.5 h-[24px]", SURFACE_BG[raised])}>
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
