import { Minus, Plus } from "lucide-react";

import { MAX_ZOOM, MIN_ZOOM } from "@/components/traces/trace-view/store";
import { Button } from "@/components/ui/button";

interface SessionTimelineControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

export default function SessionTimelineControls({ zoom, onZoomIn, onZoomOut }: SessionTimelineControlsProps) {
  return (
    <div className="absolute bottom-1.5 right-1.5 z-40 flex items-center gap-1 h-[24px]">
      <div className="flex items-center border rounded-md bg-muted px-0.5 h-[24px]">
        <Button
          aria-label="Zoom in"
          disabled={zoom >= MAX_ZOOM}
          className="min-w-5"
          variant="ghost"
          size="icon-xs"
          onClick={onZoomIn}
        >
          <Plus className="size-3" />
        </Button>
        <Button
          aria-label="Zoom out"
          disabled={zoom <= MIN_ZOOM}
          className="min-w-5"
          variant="ghost"
          size="icon-xs"
          onClick={onZoomOut}
        >
          <Minus className="size-3" />
        </Button>
      </div>
    </div>
  );
}
