import { useCallback, useEffect, useRef, useState } from "react";

import { type ResizablePanel } from "@/components/traces/trace-view/store";

/**
 * Thin hook for left-edge drag-to-resize. Computes the per-frame drag delta
 * and delegates to store.resizePanel which handles min-width clamping
 * and overflow propagation to neighboring panels.
 */
export function usePanelResize(panel: ResizablePanel, resizePanel: (panel: ResizablePanel, delta: number) => void) {
  const resizePanelRef = useRef(resizePanel);
  useEffect(() => {
    resizePanelRef.current = resizePanel;
  }, [resizePanel]);

  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      let lastX = e.clientX;
      setIsResizing(true);

      const onMouseMove = (moveEvent: MouseEvent) => {
        // Left-edge handle: moving left (negative dx) = grow, moving right (positive dx) = shrink
        const delta = lastX - moveEvent.clientX;
        lastX = moveEvent.clientX;
        if (delta !== 0) {
          resizePanelRef.current(panel, delta);
        }
      };

      const onMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [panel]
  );

  return { handleMouseDown, isResizing };
}
