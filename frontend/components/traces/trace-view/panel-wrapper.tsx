import { X } from "lucide-react";
import React, { useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DEFAULT_PANEL_WIDTH = 480;
const MIN_PANEL_WIDTH = 200;

interface PanelWrapperProps {
  children: React.ReactNode;
  /** Panel header title. If omitted, no header is rendered (useful when children have their own header). */
  title?: string;
  onClose?: () => void;
  defaultWidth?: number;
  className?: string;
}

export default function PanelWrapper({
  title,
  children,
  onClose,
  defaultWidth = DEFAULT_PANEL_WIDTH,
  className,
}: PanelWrapperProps) {
  const [width, setWidth] = useState(defaultWidth);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleResizeLeft = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = width;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        // Dragging left edge: moving left increases width, moving right decreases
        const newWidth = Math.max(MIN_PANEL_WIDTH, startWidth - (moveEvent.clientX - startX));
        setWidth(newWidth);
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [width]
  );

  return (
    <div ref={panelRef} className={cn("flex flex-col h-full flex-none relative", className)} style={{ width }}>
      {/* Left edge resize handle */}
      <div className="absolute top-0 left-0 h-full cursor-col-resize z-50 group w-2" onMouseDown={handleResizeLeft}>
        <div className="absolute top-0 left-0 h-full w-px bg-border group-hover:w-0.5 group-hover:bg-blue-400 transition-colors" />
      </div>

      {/* Panel header (optional) */}
      {title && (
        <div className="flex items-center justify-between px-2 pt-2 pb-2 flex-shrink-0">
          <span className="text-base font-medium ml-2">{title}</span>
          {onClose && (
            <Button variant="ghost" className="px-0.5 h-6 w-6" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      )}

      {/* Panel content */}
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

export { DEFAULT_PANEL_WIDTH, MIN_PANEL_WIDTH };
