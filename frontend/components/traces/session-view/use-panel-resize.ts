import { useCallback, useEffect, useRef, useState } from "react";

import { type SessionResizablePanel } from "./store";

/**
 * Left-edge drag-to-resize hook for the session view. Mirrors trace-view's
 * use-panel-resize; differs only in the panel-name type. Computes per-frame
 * delta and delegates clamping/overflow propagation to store.resizePanel.
 */
export function useSessionPanelResize(
  panel: SessionResizablePanel,
  resizePanel: (panel: SessionResizablePanel, delta: number) => void
) {
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
        // Left-edge handle: moving left = grow, moving right = shrink
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
