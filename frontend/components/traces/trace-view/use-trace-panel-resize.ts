import { useCallback, useEffect, useRef } from "react";
import { usePanelRef } from "react-resizable-panels";
import { shallow } from "zustand/shallow";

import { DEFAULT_PANEL_WIDTH, MIN_TREE_VIEW_WIDTH, useTraceViewStore } from "@/components/traces/trace-view/store";

/**
 * Encapsulates all horizontal container resize logic for the trace view:
 * - Tracks panel pixel widths so closing a panel shrinks the container correctly
 * - Syncs container width when panels open/close via header toggles
 * - Provides the left-edge drag-to-resize handler
 * - Clamps container width to never exceed the viewport width
 */
export function useTracePanelResize() {
  const { selectedSpan, tracesAgentOpen, containerWidth, setContainerWidth } = useTraceViewStore(
    (state) => ({
      selectedSpan: state.selectedSpan,
      tracesAgentOpen: state.tracesAgentOpen,
      containerWidth: state.containerWidth,
      setContainerWidth: state.setContainerWidth,
    }),
    shallow
  );

  // Panel refs for reading pixel width on close
  const spanPanelRef = usePanelRef();
  const chatPanelRef = usePanelRef();

  // Track last known pixel widths so we can subtract on close
  const spanPanelPixelWidth = useRef(DEFAULT_PANEL_WIDTH);
  const chatPanelPixelWidth = useRef(DEFAULT_PANEL_WIDTH);

  // Track previous panel visibility to detect open/close
  const prevSelectedSpan = useRef(selectedSpan);
  const prevTracesAgentOpen = useRef(tracesAgentOpen);

  const clampWidth = useCallback((width: number) => {
    const maxWidth = typeof window !== "undefined" ? window.innerWidth : Infinity;
    return Math.min(maxWidth, Math.max(MIN_TREE_VIEW_WIDTH, width));
  }, []);

  // Sync container width when panels are toggled
  useEffect(() => {
    let delta = 0;

    const wasSpanOpen = !!prevSelectedSpan.current;
    const isSpanOpen = !!selectedSpan;
    if (!wasSpanOpen && isSpanOpen) delta += DEFAULT_PANEL_WIDTH;
    if (wasSpanOpen && !isSpanOpen) delta -= spanPanelPixelWidth.current;

    if (!prevTracesAgentOpen.current && tracesAgentOpen) delta += DEFAULT_PANEL_WIDTH;
    if (prevTracesAgentOpen.current && !tracesAgentOpen) delta -= chatPanelPixelWidth.current;

    prevSelectedSpan.current = selectedSpan;
    prevTracesAgentOpen.current = tracesAgentOpen;

    if (delta !== 0) {
      setContainerWidth(clampWidth(containerWidth + delta));
    }
  }, [selectedSpan, tracesAgentOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clamp on window resize
  useEffect(() => {
    const handleWindowResize = () => {
      const maxWidth = window.innerWidth;
      if (containerWidth > maxWidth) {
        setContainerWidth(maxWidth);
      }
    };
    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, [containerWidth, setContainerWidth]);

  const handleResizeLeftEdge = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = containerWidth;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const newWidth = clampWidth(startWidth - (moveEvent.clientX - startX));
        setContainerWidth(newWidth);
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [containerWidth, setContainerWidth, clampWidth]
  );

  const defaultPanelPercent = `${(DEFAULT_PANEL_WIDTH / containerWidth) * 100}%`;

  const onSpanPanelResize = useCallback((size: { inPixels?: number }) => {
    if (size.inPixels) spanPanelPixelWidth.current = size.inPixels;
  }, []);

  const onChatPanelResize = useCallback((size: { inPixels?: number }) => {
    if (size.inPixels) chatPanelPixelWidth.current = size.inPixels;
  }, []);

  return {
    containerWidth: clampWidth(containerWidth),
    spanPanelRef,
    chatPanelRef,
    handleResizeLeftEdge,
    defaultPanelPercent,
    onSpanPanelResize,
    onChatPanelResize,
  };
}
