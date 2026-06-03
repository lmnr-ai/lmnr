import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

import { MAX_ZOOM, MIN_ZOOM, useUltimateTraceViewStore, ZOOM_INCREMENT } from "../store";

interface ZoomControlsProps {
  traceId: string;
}

export default function ZoomControls({ traceId }: ZoomControlsProps) {
  const zoom = useUltimateTraceViewStore((state) => state.traces.get(traceId)?.zoom ?? 1);
  const setZoom = useUltimateTraceViewStore((state) => state.setZoom);

  return (
    <div className="absolute bottom-1.5 right-1.5 z-40 flex items-center bg-muted border rounded-md px-0.5 h-[24px]">
      <Button
        disabled={zoom >= MAX_ZOOM}
        className="size-5 min-w-5"
        variant="ghost"
        size="icon"
        onClick={() => setZoom(traceId, zoom + ZOOM_INCREMENT)}
      >
        <Plus className="size-3" />
      </Button>
      <Button
        disabled={zoom <= MIN_ZOOM}
        className="size-5 min-w-5"
        variant="ghost"
        size="icon"
        onClick={() => setZoom(traceId, zoom - ZOOM_INCREMENT)}
      >
        <Minus className="size-3" />
      </Button>
    </div>
  );
}
