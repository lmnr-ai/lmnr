import { DollarSign, Minus, Plus } from "lucide-react";

import { MAX_ZOOM, MIN_ZOOM, ZOOM_INCREMENT } from "@/components/traces/trace-view/store";
import { useTraceViewBaseStore } from "@/components/traces/trace-view/store/base";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export default function Controls() {
  const { condensedTimelineZoom, setCondensedTimelineZoom, isCostHeatmapVisible, setIsCostHeatmapVisible } =
    useTraceViewBaseStore((state) => ({
      condensedTimelineZoom: state.condensedTimelineZoom,
      setCondensedTimelineZoom: state.setCondensedTimelineZoom,
      isCostHeatmapVisible: state.isCostHeatmapVisible,
      setIsCostHeatmapVisible: state.setIsCostHeatmapVisible,
    }));

  return (
    <div className="absolute bottom-1.5 right-1.5 z-40 flex items-center bg-muted border rounded-md px-0.5 h-[24px]">
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className={cn("size-5 min-w-5", isCostHeatmapVisible && "bg-secondary")}
              variant="ghost"
              size="icon"
              onClick={() => setIsCostHeatmapVisible(!isCostHeatmapVisible)}
            >
              <DollarSign className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Toggle cost heatmap</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <div className="w-px h-3 bg-border mx-0.5" />
      <div className="flex">
        <Button
          disabled={condensedTimelineZoom >= MAX_ZOOM}
          className="size-5 min-w-5"
          variant="ghost"
          size="icon"
          onClick={() => setCondensedTimelineZoom(condensedTimelineZoom + ZOOM_INCREMENT)}
        >
          <Plus className="size-3" />
        </Button>
        <Button
          disabled={condensedTimelineZoom <= MIN_ZOOM}
          className="size-5 min-w-5"
          variant="ghost"
          size="icon"
          onClick={() => setCondensedTimelineZoom(condensedTimelineZoom - ZOOM_INCREMENT)}
        >
          <Minus className="size-3" />
        </Button>
      </div>
    </div>
  );
}
