import { Minus, Plus } from "lucide-react";
import { shallow } from "zustand/shallow";

import { MAX_ZOOM, MIN_ZOOM, ZOOM_INCREMENT } from "@/components/traces/trace-view/store";
import { Button } from "@/components/ui/button";

import { useSessionViewStore } from "../store";

export default function SessionTimelineControls() {
  const { zoom, setZoom } = useSessionViewStore(
    (s) => ({
      zoom: s.sessionTimelineZoom,
      setZoom: s.setSessionTimelineZoom,
    }),
    shallow
  );

  return (
    <div className="absolute bottom-1.5 right-1.5 z-40 flex items-center gap-1 h-[24px]">
      <div className="flex items-center border rounded-md bg-muted px-0.5 h-[24px]">
        <Button
          disabled={zoom >= MAX_ZOOM}
          className="size-5 min-w-5"
          variant="ghost"
          size="icon"
          onClick={() => setZoom(zoom + ZOOM_INCREMENT)}
        >
          <Plus className="size-3" />
        </Button>
        <Button
          disabled={zoom <= MIN_ZOOM}
          className="size-5 min-w-5"
          variant="ghost"
          size="icon"
          onClick={() => setZoom(zoom - ZOOM_INCREMENT)}
        >
          <Minus className="size-3" />
        </Button>
      </div>
    </div>
  );
}
