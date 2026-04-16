import { X } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

import SignalEventsPanel from "../signal-events-panel";

const DEFAULT_SIGNAL_CARD_HEIGHT = 300;
const MIN_SIGNAL_CARD_HEIGHT = 80;
const MAX_SIGNAL_CARD_HEIGHT = 500;

export default function ResizableSignalCard({ traceId, onClose }: { traceId: string; onClose: () => void }) {
  const [height, setHeight] = useState(DEFAULT_SIGNAL_CARD_HEIGHT);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDragging.current = true;
      startY.current = e.clientY;
      startHeight.current = height;
      e.preventDefault();

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isDragging.current) return;
        const delta = moveEvent.clientY - startY.current;
        const newHeight = Math.min(
          MAX_SIGNAL_CARD_HEIGHT,
          Math.max(MIN_SIGNAL_CARD_HEIGHT, startHeight.current + delta)
        );
        setHeight(newHeight);
      };

      const handleMouseUp = () => {
        isDragging.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [height]
  );

  return (
    <div
      className="flex flex-col rounded-md border border-blue-400/30 bg-blue-400/12 overflow-hidden relative"
      style={{ height }}
    >
      <div className="flex-shrink-0 pr-2 pl-2.5 pt-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-blue-200/60">Signal events</span>
        <Button variant="ghost" className="h-6 w-6 p-0" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden px-2">
        <SignalEventsPanel traceId={traceId} />
      </div>
      <div
        onMouseDown={handleMouseDown}
        className="h-1.5 cursor-row-resize flex items-center justify-center hover:bg-blue-300/10 transition-colors shrink-0 absolute bottom-0 w-full"
      >
        <div className="w-8 h-0.5 rounded-full bg-primary-foreground/20" />
      </div>
    </div>
  );
}
