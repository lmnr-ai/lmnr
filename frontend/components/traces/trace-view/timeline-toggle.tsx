import { GanttChart, Minus, Plus, X } from "lucide-react";

import { MAX_ZOOM, MIN_ZOOM, ZOOM_INCREMENT, useTraceViewStoreContext } from "@/components/traces/trace-view/trace-view-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function CondensedTimelineControls() {
  const { condensedTimelineEnabled, setCondensedTimelineEnabled, condensedTimelineZoom, setCondensedTimelineZoom } =
    useTraceViewStoreContext((state) => ({
      condensedTimelineEnabled: state.condensedTimelineEnabled,
      setCondensedTimelineEnabled: state.setCondensedTimelineEnabled,
      condensedTimelineZoom: state.condensedTimelineZoom,
      setCondensedTimelineZoom: state.setCondensedTimelineZoom,
    }));

  return (
    <div
      className={cn(
        "absolute z-50 top-full flex items-center overflow-hidden transition-all duration-200",
        condensedTimelineEnabled
          ? "right-0 h-[26px] bg-muted border-b border-l rounded-none rounded-bl"
          : "right-2 h-6 bg-background hover:bg-muted rounded-md"
      )}
    >
      {/* Zoom controls - slide in from left when enabled */}
      <div
        className={cn(
          "flex items-center gap-1 overflow-hidden transition-all duration-200",
          condensedTimelineEnabled ? "w-[52px] px-1.5 py-[2px] opacity-100" : "w-0 px-0 py-0 opacity-0"
        )}
      >
        <Button
          disabled={condensedTimelineZoom === MAX_ZOOM}
          className="size-5 min-w-5"
          variant="ghost"
          size="icon"
          onClick={() => setCondensedTimelineZoom(condensedTimelineZoom + ZOOM_INCREMENT)}
        >
          <Plus className="w-3.5 h-3.5" />
        </Button>
        <Button
          disabled={condensedTimelineZoom === MIN_ZOOM}
          className="size-5 min-w-5"
          variant="ghost"
          size="icon"
          onClick={() => setCondensedTimelineZoom(condensedTimelineZoom - ZOOM_INCREMENT)}
        >
          <Minus className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Divider - separate element for full height */}
      <div
        className={cn(
          "h-full bg-border transition-all duration-200",
          condensedTimelineEnabled ? "w-px" : "w-0"
        )}
      />

      {/* Toggle/Close button */}
      <div
        className={cn(
          "flex items-center transition-all duration-200",
          condensedTimelineEnabled ? "px-1.5" : "px-0"
        )}
      >
        <Button
          onClick={() => setCondensedTimelineEnabled(!condensedTimelineEnabled)}
          variant="ghost"
          size="icon"
          className={cn(
            "transition-all duration-200",
            condensedTimelineEnabled ? "size-5 min-w-5" : "h-6 w-auto px-1.5"
          )}
        >
          {condensedTimelineEnabled ? (
            <X className="w-3.5 h-3.5" />
          ) : (
            <span className="flex items-center text-xs">
              <GanttChart size={14} className="mr-1" />
              Timeline
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}
