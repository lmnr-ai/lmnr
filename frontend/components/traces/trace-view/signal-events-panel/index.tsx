"use client";

import { motion } from "framer-motion";
import { useCallback, useMemo, useState } from "react";
import { shallow } from "zustand/shallow";

import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

import { PanelHoverContext } from "./hover-context";
import PanelBody from "./panel-body";
import { getSignalDisplayColor } from "./utils";

const PANEL_HEIGHT = 160;
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

  // Resolve the active signal's base color once and share it with the
  // trigger, the portal, and ExpandedContent. Alpha modifiers are inlined
  // at each usage site.
  const baseColor = useMemo(() => {
    const id =
      activeSignalTabId && traceSignals.some((s) => s.signalId === activeSignalTabId)
        ? activeSignalTabId
        : initialSignalId && traceSignals.some((s) => s.signalId === initialSignalId)
          ? initialSignalId
          : (traceSignals[0]?.signalId ?? "");
    const active = traceSignals.find((s) => s.signalId === id);
    return active ? getSignalDisplayColor(active) : null;
  }, [traceSignals, activeSignalTabId, initialSignalId]);

  const handleClose = useCallback(() => {
    setHovered(false);
    onClose();
  }, [onClose]);

  if (!isTraceSignalsLoading && traceSignals.length === 0) return null;

  // Two-layer background: a solid `bg-background` underneath (provided by
  // className) and the semi-transparent accent tint on top via background-image.
  // Without the solid back, the popover is see-through over the trigger.
  const tintLayer = baseColor ? `${baseColor}10` : "hsl(var(--muted) / 0.4)";
  const outerStyle = {
    borderColor: baseColor ? `${baseColor}40` : "hsl(var(--border))",
    backgroundImage: `linear-gradient(${tintLayer}, ${tintLayer})`,
  };

  return (
    <>
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
              <PanelBody traceId={traceId} onClose={handleClose} baseColor={baseColor} />
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
            // Animating `maxHeight` (not `height`) keeps the box naturally
            // sized to its content while capping growth. Framer never writes
            // an inline `height`, so `height: auto` survives the animation and
            // the inner ScrollArea's `flex-1 min-h-0` resolves correctly
            // against the capped box when content overflows.
            initial={{ maxHeight: PANEL_HEIGHT }}
            animate={{ maxHeight: POPOVER_MAX_HEIGHT }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="flex flex-col overflow-hidden"
          >
            <PanelHoverContext.Provider value={hovered}>
              <PanelBody traceId={traceId} onClose={handleClose} baseColor={baseColor} />
            </PanelHoverContext.Provider>
          </motion.div>
        </HoverCardContent>
      </HoverCard>
    </>
  );
}
