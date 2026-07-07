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

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      e.preventDefault();
      const handle = e.currentTarget;
      let lastX = e.clientX;
      // Capture the pointer so move/up keep firing on the handle even when the
      // cursor crosses an iframe (custom renderer) mid-drag — document-level
      // listeners go silent over iframes and freeze the resize.
      handle.setPointerCapture(e.pointerId);
      setIsResizing(true);

      const onMove = (moveEvent: PointerEvent) => {
        // Left-edge handle: moving left (negative dx) = grow, moving right (positive dx) = shrink
        const delta = lastX - moveEvent.clientX;
        lastX = moveEvent.clientX;
        if (delta !== 0) {
          resizePanelRef.current(panel, delta);
        }
      };

      const onUp = () => {
        setIsResizing(false);
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onUp);
      };

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onUp);
    },
    [panel]
  );

  return { handlePointerDown, isResizing };
}
