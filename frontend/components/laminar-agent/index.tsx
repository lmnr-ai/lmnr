"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { shallow } from "zustand/shallow";

import AgentPanel from "./agent-panel";
import CollapsedButton from "./collapsed-button";
import { useLaminarAgentStore } from "./store";

const FLOATING_MIN_WIDTH = 320;
const FLOATING_MAX_WIDTH = 700;
const FLOATING_DEFAULT_WIDTH = 400;

export default function LaminarAgent() {
  const { viewMode, sideBySideContainer } = useLaminarAgentStore(
    (s) => ({
      viewMode: s.viewMode,
      sideBySideContainer: s.sideBySideContainer,
    }),
    shallow
  );

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

  // Determine how to render the agent panel based on view mode
  const isOpen = viewMode === "floating" || viewMode === "side-by-side";
  const currentMode = viewMode === "side-by-side" ? "side-by-side" : "floating";

  // Agent panel content (single instance, always mounted when open)
  const agentPanel = isOpen ? <AgentPanel currentMode={currentMode} /> : null;

  return (
    <>
      <CollapsedButton />

      {/* Floating mode: render in fixed-position container, full height with gap */}
      <AnimatePresence>
        {viewMode === "floating" && (
          <motion.div
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed right-2 top-1.5 bottom-2 z-[55] max-w-[calc(100vw-3rem)] rounded-lg border shadow-xl overflow-hidden bg-background pointer-events-auto"
            style={{ width: floatingWidth }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Left edge resize handle */}
            <div
              className="absolute left-0 top-0 bottom-0 w-0.5 cursor-col-resize z-50 transition-colors"
              onMouseDown={handleResizeStart}
            />
            {agentPanel}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Side-by-side mode: portal into the container provided by SideBySideWrapper */}
      {viewMode === "side-by-side" && sideBySideContainer && createPortal(agentPanel, sideBySideContainer)}
    </>
  );
}
