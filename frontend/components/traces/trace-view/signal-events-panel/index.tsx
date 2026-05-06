"use client";

import { motion } from "framer-motion";
import { useCallback, useMemo, useState } from "react";
import { shallow } from "zustand/shallow";

import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

import { PanelHoverContext } from "./hover-context";
import PanelBody from "./panel-body";
import { deriveAccent, PanelAccentProvider } from "./utils";

const PANEL_HEIGHT = 200;
const HOVER_OPEN_DELAY_MS = 300;
const HOVER_CLOSE_DELAY_MS = 100;
const POPOVER_MAX_HEIGHT = 480;

const OUTER_CLS = "flex flex-col rounded-lg border overflow-hidden relative";

interface Props {
  traceId: string;
  onClose: () => void;
  className?: string;
}

export default function SignalEventsPanel({ traceId, onClose, className }: Props) {
  const { traceSignals, isTraceSignalsLoading, activeSignalTabId, initialSignalId } = useTraceViewStore(
    (state) => ({
      traceSignals: state.traceSignals,
      isTraceSignalsLoading: state.isTraceSignalsLoading,
      activeSignalTabId: state.activeSignalTabId,
      initialSignalId: state.initialSignalId,
    }),
    shallow
  );

  const [hovered, setHovered] = useState(false);

  // Resolve active signal so we can derive the accent palette once and share
  // it via context (so the trigger, the portal, and ExpandedContent all read
  // identical colors without re-deriving from the store).
  const accent = useMemo(() => {
    const id =
      activeSignalTabId && traceSignals.some((s) => s.signalId === activeSignalTabId)
        ? activeSignalTabId
        : initialSignalId && traceSignals.some((s) => s.signalId === initialSignalId)
          ? initialSignalId
          : (traceSignals[0]?.signalId ?? "");
    return deriveAccent(traceSignals.find((s) => s.signalId === id));
  }, [traceSignals, activeSignalTabId, initialSignalId]);

  const handleClose = useCallback(() => {
    setHovered(false);
    onClose();
  }, [onClose]);

  if (!isTraceSignalsLoading && traceSignals.length === 0) return null;

  // Two-layer background: a solid `bg-background` underneath (provided by
  // className) and the semi-transparent accent tint on top via background-image.
  // Without the solid back, the popover is see-through over the trigger.
  const tintLayer = accent.panelTint ?? "hsl(var(--muted) / 0.4)";
  const outerStyle = {
    borderColor: accent.borderColor,
    backgroundImage: `linear-gradient(${tintLayer}, ${tintLayer})`,
  };

  return (
    <PanelAccentProvider value={accent}>
      <HoverCard
        openDelay={HOVER_OPEN_DELAY_MS}
        closeDelay={HOVER_CLOSE_DELAY_MS}
        open={hovered}
        onOpenChange={setHovered}
      >
        <HoverCardTrigger asChild>
          <motion.div
            className={cn(OUTER_CLS, "bg-background", className)}
            style={{ ...outerStyle, height: PANEL_HEIGHT }}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: PANEL_HEIGHT, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            <PanelHoverContext.Provider value={false}>
              <PanelBody traceId={traceId} onClose={handleClose} />
            </PanelHoverContext.Provider>
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
          className={cn(
            OUTER_CLS,
            "bg-background p-0 shadow-xl data-[state=open]:zoom-in-100 data-[state=open]:fade-in-100"
          )}
          style={{
            ...outerStyle,
            width: "var(--radix-hover-card-trigger-width)",
          }}
        >
          <motion.div
            // Bottom edge slides down from the trigger height to the natural
            // content height (capped). No flex-1 here — that fights the
            // explicit height we're animating.
            initial={{ height: PANEL_HEIGHT }}
            animate={{ height: "auto" }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="flex flex-col overflow-hidden"
            style={{ maxHeight: POPOVER_MAX_HEIGHT }}
          >
            <PanelHoverContext.Provider value={hovered}>
              <PanelBody traceId={traceId} onClose={handleClose} />
            </PanelHoverContext.Provider>
          </motion.div>
        </HoverCardContent>
      </HoverCard>
    </PanelAccentProvider>
  );
}
