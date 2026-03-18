"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { shallow } from "zustand/shallow";

import AgentPanel from "./agent-panel";
import CollapsedButton from "./collapsed-button";
import { useLaminarAgentStore } from "./store";

export default function LaminarAgent() {
  const { viewMode, setViewMode, collapse, sideBySideContainer } = useLaminarAgentStore(
    (s) => ({
      viewMode: s.viewMode,
      setViewMode: s.setViewMode,
      collapse: s.collapse,
      sideBySideContainer: s.sideBySideContainer,
    }),
    shallow
  );

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

      {/* Floating mode: render in fixed-position container */}
      {viewMode === "floating" && (
        <div
          className="fixed right-6 bottom-6 z-[55] w-[400px] max-w-[calc(100vw-3rem)] h-[70vh] min-h-[300px] max-h-[calc(100vh-3rem)] rounded-lg border shadow-xl overflow-hidden bg-background pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {agentPanel}
        </div>
      )}

      {/* Side-by-side mode: portal into the container provided by SideBySideWrapper */}
      {viewMode === "side-by-side" && sideBySideContainer && createPortal(agentPanel, sideBySideContainer)}
    </>
  );
}
