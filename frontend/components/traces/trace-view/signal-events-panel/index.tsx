"use client";

import { motion } from "framer-motion";
import { useCallback, useState } from "react";
import { shallow } from "zustand/shallow";

import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

import { PanelHoverContext } from "./hover-context";
import PanelBody from "./panel-body";

const PANEL_HEIGHT = 160;
const HOVER_OPEN_DELAY_MS = 300;
const HOVER_CLOSE_DELAY_MS = 100;
const POPOVER_MAX_HEIGHT = 480;

const OUTER_CLS = "flex flex-col rounded-lg border border-blue-400/40 overflow-hidden relative bg-secondary";
// Tint sits on an inner layer over bg-secondary. Trigger rests at 5%; popover
// bumps to 7% to signal the active hover state.
const TINT_REST_CLS = "bg-blue-400/5";
const TINT_ACTIVE_CLS = "bg-blue-400/7";

interface Props {
  traceId: string;
  onClose: () => void;
  className?: string;
}

export default function SignalEventsPanel({ traceId, onClose, className }: Props) {
  const { traceSignals, isTraceSignalsLoading } = useTraceViewStore(
    (state) => ({
      traceSignals: state.traceSignals,
      isTraceSignalsLoading: state.isTraceSignalsLoading,
    }),
    shallow
  );

  const [hovered, setHovered] = useState(false);

  const handleClose = useCallback(() => {
    setHovered(false);
    onClose();
  }, [onClose]);

  if (!isTraceSignalsLoading && traceSignals.length === 0) return null;

  return (
    <HoverCard
      openDelay={HOVER_OPEN_DELAY_MS}
      closeDelay={HOVER_CLOSE_DELAY_MS}
      open={hovered}
      onOpenChange={setHovered}
    >
      <HoverCardTrigger asChild>
        <motion.div
          className={cn(OUTER_CLS, className)}
          style={{ height: PANEL_HEIGHT }}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: PANEL_HEIGHT, opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          <div className={cn("flex flex-col flex-1 min-h-0", TINT_REST_CLS)}>
            <PanelHoverContext.Provider value={false}>
              <PanelBody traceId={traceId} onClose={handleClose} />
            </PanelHoverContext.Provider>
          </div>
        </motion.div>
      </HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        align="start"
        sideOffset={-PANEL_HEIGHT}
        avoidCollisions={false}
        // Disable Radix's default open zoom/fade so the only entrance is the
        // inner motion.div's height grow. Keep close defaults so the popover
        // gracefully fades out.
        className={cn(OUTER_CLS, "p-0 shadow-xl data-[state=open]:zoom-in-100 data-[state=open]:fade-in-100")}
        style={{ width: "var(--radix-hover-card-trigger-width)" }}
      >
        <motion.div
          // Animating `maxHeight` (not `height`) keeps the box naturally
          // sized to its content while capping growth. Framer never writes
          // an inline `height`, so `height: auto` survives the animation and
          // the inner ScrollArea's `flex-1 min-h-0` resolves correctly
          // against the capped box when content overflows.
          initial={{ maxHeight: PANEL_HEIGHT }}
          animate={{ maxHeight: POPOVER_MAX_HEIGHT }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className={cn("flex flex-col overflow-hidden", TINT_ACTIVE_CLS)}
        >
          <PanelHoverContext.Provider value={hovered}>
            <PanelBody traceId={traceId} onClose={handleClose} />
          </PanelHoverContext.Provider>
        </motion.div>
      </HoverCardContent>
    </HoverCard>
  );
}
