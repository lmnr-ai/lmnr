"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import AgentPanel from "./agent-panel";
import CollapsedButton from "./collapsed-button";
import { useLaminarAgentStore } from "./store";

const FLOATING_MIN_WIDTH = 320;
const FLOATING_MAX_WIDTH = 700;
const FLOATING_DEFAULT_WIDTH = 400;

export default function LaminarAgent() {
  const { viewMode, setViewMode, collapse, sideBySideContainer } = useLaminarAgentStore((s) => ({
    viewMode: s.viewMode,
    setViewMode: s.setViewMode,
    collapse: s.collapse,
    sideBySideContainer: s.sideBySideContainer,
  }));

  const [floatingWidth, setFloatingWidth] = useState(FLOATING_DEFAULT_WIDTH);
  const isResizing = useRef(false);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = window.innerWidth - moveEvent.clientX - 24; // 24px = right-6 gap
      setFloatingWidth(Math.min(FLOATING_MAX_WIDTH, Math.max(FLOATING_MIN_WIDTH, newWidth)));
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+Shift+L (Mac) or Ctrl+Shift+L (Windows/Linux) to toggle agent
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        if (viewMode === "collapsed") {
          setViewMode("floating");
        } else {
          collapse();
        }
        return;
      }

      // Escape to collapse from floating mode
      if (e.key === "Escape" && viewMode === "floating") {
        // Don't collapse if focus is inside a modal/dialog/dropdown
        const activeEl = document.activeElement;
        const isInsideOverlay = activeEl?.closest(
          "[role='dialog'], [role='menu'], [data-radix-popper-content-wrapper]"
        );
        // Don't collapse if user is typing in an input/textarea
        const isTyping =
          activeEl?.tagName === "TEXTAREA" || activeEl?.tagName === "INPUT" || activeEl?.closest("[contenteditable]");
        if (!isInsideOverlay && !isTyping) {
          e.preventDefault();
          collapse();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [viewMode, setViewMode, collapse]);

  // Determine how to render the agent panel based on view mode
  const isOpen = viewMode === "floating" || viewMode === "side-by-side";
  const currentMode = viewMode === "side-by-side" ? "side-by-side" : "floating";

  // Agent panel content (single instance, always mounted when open)
  const agentPanel = isOpen ? <AgentPanel currentMode={currentMode} /> : null;

  return (
    <>
      <CollapsedButton />

      {/* Floating mode: render in fixed-position container, full height with gap */}
      {viewMode === "floating" && (
        <div
          className="fixed right-6 top-4 bottom-4 z-[55] max-w-[calc(100vw-3rem)] rounded-lg border shadow-xl overflow-hidden bg-background pointer-events-auto"
          style={{ width: floatingWidth }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Left edge resize handle */}
          <div
            className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10 hover:bg-primary/20 transition-colors"
            onMouseDown={handleResizeStart}
          />
          {agentPanel}
        </div>
      )}

      {/* Side-by-side mode: portal into the container provided by SideBySideWrapper */}
      {viewMode === "side-by-side" && sideBySideContainer && createPortal(agentPanel, sideBySideContainer)}
    </>
  );
}
