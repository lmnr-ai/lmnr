import { type RefObject, useCallback } from "react";
import { DollarSign, Minus, Plus } from "lucide-react";

import { MAX_ZOOM, MIN_ZOOM, ZOOM_INCREMENT } from "@/components/traces/trace-view/store";
import { useTraceViewBaseStore } from "@/components/traces/trace-view/store/base";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ControlsProps {
  scrollRef: RefObject<HTMLDivElement | null>;
}

export default function Controls({ scrollRef }: ControlsProps) {
  const { condensedTimelineZoom, setCondensedTimelineZoom, isCostHeatmapVisible, setIsCostHeatmapVisible } =
    useTraceViewBaseStore((state) => ({
      condensedTimelineZoom: state.condensedTimelineZoom,
      setCondensedTimelineZoom: state.setCondensedTimelineZoom,
      isCostHeatmapVisible: state.isCostHeatmapVisible,
      setIsCostHeatmapVisible: state.setIsCostHeatmapVisible,
    }));

  const handleZoom = useCallback(
    (direction: "in" | "out") => {
      const container = scrollRef.current;
      if (!container) return;

      const newZoom =
        direction === "in" ? condensedTimelineZoom + ZOOM_INCREMENT : condensedTimelineZoom - ZOOM_INCREMENT;
      if (newZoom < MIN_ZOOM || newZoom > MAX_ZOOM) return;

      // Keep the center of the visible area stable after zoom
      const containerWidth = container.clientWidth;
      const centerX = container.scrollLeft + containerWidth / 2;
      const fraction = centerX / container.scrollWidth;

      setCondensedTimelineZoom(newZoom);

      requestAnimationFrame(() => {
        const newScrollWidth = container.scrollWidth;
        const newScrollLeft = fraction * newScrollWidth - containerWidth / 2;
        container.scrollLeft = Math.max(0, Math.min(newScrollLeft, newScrollWidth - containerWidth));
      });
    },
    [scrollRef, condensedTimelineZoom, setCondensedTimelineZoom]
  );

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
              onClick={() => setIsCostHeatmapVisible(!isCostHeatmapVisible)}
            >
              <DollarSign className="size-3" />
              <span>Cost heatmap</span>
            </button>
          </TooltipTrigger>
          <TooltipContent className="border">Toggle cost heatmap</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <div className="flex items-center border rounded-md bg-muted px-0.5 h-[24px]">
        <Button
          disabled={condensedTimelineZoom >= MAX_ZOOM}
          className="size-5 min-w-5"
          variant="ghost"
          size="icon"
          onClick={() => handleZoom("in")}
        >
          <Plus className="size-3" />
        </Button>
        <Button
          disabled={condensedTimelineZoom <= MIN_ZOOM}
          className="size-5 min-w-5"
          variant="ghost"
          size="icon"
          onClick={() => handleZoom("out")}
        >
          <Minus className="size-3" />
        </Button>
      </div>
    </div>
  );
}
