"use client";

import { motion } from "framer-motion";
import { useCallback, useMemo, useRef, useState } from "react";
import { shallow } from "zustand/shallow";

import { getSignalColor } from "@/components/signals/utils";
import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

import { PanelHoverContext } from "./hover-context";
import PanelBody from "./panel-body";

const DEFAULT_HEIGHT = 150;
const MIN_HEIGHT = 80;
const MAX_HEIGHT = 500;
const HOVER_OPEN_DELAY_MS = 350;
const HOVER_CLOSE_DELAY_MS = 100;
const EXPANDED_BOTTOM_GAP_PX = 24;

interface Props {
  traceId: string;
  onClose: () => void;
  className?: string;
}

export default function SignalEventsPanel({ traceId, onClose, className }: Props) {
  // Single subscription with shallow equality — avoids 4 separate useStore
  // subscriptions and re-renders when any unrelated store slice changes.
  const { traceSignals, isTraceSignalsLoading, activeSignalTabId, setActiveSignalTabId } = useTraceViewStore(
    (state) => ({
      traceSignals: state.traceSignals,
      isTraceSignalsLoading: state.isTraceSignalsLoading,
      activeSignalTabId: state.activeSignalTabId,
      setActiveSignalTabId: state.setActiveSignalTabId,
    }),
    shallow
  );

  const activeColor = useMemo(() => {
    const active = traceSignals.find((s) => s.signalId === activeSignalTabId);
    return getSignalColor(active?.signalId, active?.color);
  }, [traceSignals, activeSignalTabId]);

  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [isResizing, setIsResizing] = useState(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);

  const handleClose = useCallback(() => {
    setHovered(false);
    onClose();
  }, [onClose]);

  const cardVariants = useMemo(
    () => ({
      initial: { height: 0, opacity: 0 },
      open: (h: number) => ({
        height: h,
        opacity: 1,
        transition: { type: "spring", stiffness: 300, damping: 30 },
      }),
      resizing: (h: number) => ({
        height: h,
        opacity: 1,
        transition: { duration: 0 },
      }),
      closed: { height: 0, opacity: 0 },
    }),
    []
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setIsResizing(true);
      startY.current = e.clientY;
      startHeight.current = height;
      e.preventDefault();

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientY - startY.current;
        const newHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startHeight.current + delta));
        setHeight(newHeight);
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [height]
  );

  return (
    <HoverCard
      openDelay={HOVER_OPEN_DELAY_MS}
      closeDelay={HOVER_CLOSE_DELAY_MS}
      open={hovered}
      onOpenChange={setHovered}
    >
      <HoverCardTrigger asChild>
        <motion.div
          ref={containerRef}
          className={cn("flex flex-col rounded-lg border overflow-hidden relative bg-muted/40", className)}
          style={{ borderColor: `${activeColor}80` }}
          custom={height}
          variants={cardVariants}
          initial="initial"
          animate={isResizing ? "resizing" : "open"}
          exit="closed"
        >
          <PanelHoverContext.Provider value={false}>
            <PanelBody
              traceId={traceId}
              onClose={handleClose}
              activeColor={activeColor}
              isTraceSignalsLoading={isTraceSignalsLoading}
              traceSignals={traceSignals}
              activeSignalTabId={activeSignalTabId}
              setActiveSignalTabId={setActiveSignalTabId}
            />
          </PanelHoverContext.Provider>
          {/* Scroll-affordance: subtle gradient at the bottom of the collapsed
              panel that fades to the active signal color, hinting that the
              panel has more content (and is hover-expandable). Fades out when
              the popover takes over so it doesn't double up. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-8 transition-opacity duration-150"
            style={{
              background: `linear-gradient(to bottom, transparent, ${activeColor}10)`,
              opacity: hovered ? 0 : 1,
            }}
          />
          <div
            onMouseDown={handleMouseDown}
            className="h-1 cursor-row-resize flex items-center justify-center hover:bg-[#18181B] transition-colors shrink-0 absolute bottom-0 w-full"
          />
        </motion.div>
      </HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        align="start"
        sideOffset={-height}
        avoidCollisions={false}
        // Disable the shadcn HoverCard primitive's open-side scale/fade so the
        // ONLY entrance the user sees is the inner motion.div's height grow.
        // We keep the default close animations (zoom-out-95 + fade-out-0) so
        // the popover gracefully fades out instead of vanishing in one frame.
        className="rounded-lg border overflow-hidden bg-[#18181B] shadow-xl p-0 data-[state=open]:zoom-in-100 data-[state=open]:fade-in-100"
        style={{
          width: "var(--radix-hover-card-trigger-width)",
          borderColor: `${activeColor}80`,
        }}
      >
        <motion.div
          // Animates the popover's expansion: bottom edge slides down from the
          // trigger height to the natural content height (capped by maxHeight).
          // No flex-1 here — that fights the explicit height value we're animating.
          initial={{ height }}
          animate={{ height: "auto" }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="flex flex-col overflow-hidden max-h-[400px]"
        >
          <PanelHoverContext.Provider value={hovered}>
            <PanelBody
              traceId={traceId}
              onClose={handleClose}
              activeColor={activeColor}
              isTraceSignalsLoading={isTraceSignalsLoading}
              traceSignals={traceSignals}
              activeSignalTabId={activeSignalTabId}
              setActiveSignalTabId={setActiveSignalTabId}
              noSharedLayout
            />
          </PanelHoverContext.Provider>
        </motion.div>
      </HoverCardContent>
    </HoverCard>
  );
}
