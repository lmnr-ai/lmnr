import { Minus, Plus } from "lucide-react";

import {
  CONDENSED_TIMELINE_MAX_ZOOM,
  CONDENSED_TIMELINE_MIN_ZOOM,
  useRolloutSessionStoreContext,
  ZOOM_INCREMENT,
} from "@/components/rollout-sessions/rollout-session-view/rollout-session-store";
import { Button } from "@/components/ui/button";

export default function ZoomControls() {
  const { condensedTimelineZoom, setCondensedTimelineZoom } = useRolloutSessionStoreContext((state) => ({
    condensedTimelineZoom: state.condensedTimelineZoom,
    setCondensedTimelineZoom: state.setCondensedTimelineZoom,
  }));

  return (
    <div className="absolute bottom-1.5 right-1.5 z-40 flex items-center bg-muted border rounded-md px-0.5 h-[24px]">
      <Button
        disabled={condensedTimelineZoom >= CONDENSED_TIMELINE_MAX_ZOOM}
        className="size-5 min-w-5"
        variant="ghost"
        size="icon"
        onClick={() => setCondensedTimelineZoom(condensedTimelineZoom + ZOOM_INCREMENT)}
      >
        <Plus className="size-3" />
      </Button>
      <Button
        disabled={condensedTimelineZoom <= CONDENSED_TIMELINE_MIN_ZOOM}
        className="size-5 min-w-5"
        variant="ghost"
        size="icon"
        onClick={() => setCondensedTimelineZoom(condensedTimelineZoom - ZOOM_INCREMENT)}
      >
        <Minus className="size-3" />
      </Button>
    </div>
  );
}
