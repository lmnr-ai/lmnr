"use client";

import { motion } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { shallow } from "zustand/shallow";

import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import SignalRow from "./signal-row";
import { getSignalDisplayColor } from "./utils";

const DEFAULT_HEIGHT = 220;
const MIN_HEIGHT = 80;
const MAX_HEIGHT = 600;
const FALLBACK_BORDER = "hsl(var(--border))";

interface Props {
  traceId: string;
  onClose: () => void;
  className?: string;
}

export default function SignalEventsPanel({ traceId, onClose, className }: Props) {
  const { traceSignals, isTraceSignalsLoading, initialSignalId } = useTraceViewStore(
    (state) => ({
      traceSignals: state.traceSignals,
      isTraceSignalsLoading: state.isTraceSignalsLoading,
      initialSignalId: state.initialSignalId,
    }),
    shallow
  );

  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [isResizing, setIsResizing] = useState(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  // Single-select accordion. Default = `initialSignalId` (set from props/URL
  // at store creation) if it matches a fetched signal, else the first signal.
  // Once the user picks something — including closing the open row — we honor
  // that explicit choice. `undefined` means "no user choice yet → use default".
  const [userExpandedId, setUserExpandedId] = useState<string | null | undefined>(undefined);
  const expandedId = useMemo(() => {
    if (userExpandedId !== undefined) return userExpandedId;
    if (initialSignalId && traceSignals.some((s) => s.signalId === initialSignalId)) {
      return initialSignalId;
    }
    return traceSignals[0]?.signalId ?? null;
  }, [userExpandedId, initialSignalId, traceSignals]);

  const handleToggle = useCallback(
    (signalId: string) => setUserExpandedId(expandedId === signalId ? null : signalId),
    [expandedId]
  );

  // Border shares the expanded row's display color at 80% opacity (`cc` hex).
  // No row expanded → default border.
  const borderColor = useMemo(() => {
    const expanded = traceSignals.find((s) => s.signalId === expandedId);
    if (!expanded) return FALLBACK_BORDER;
    return `${getSignalDisplayColor(expanded)}cc`;
  }, [traceSignals, expandedId]);

  const cardVariants = useMemo(
    () => ({
      initial: { height: 0, opacity: 0 },
      open: (h: number) => ({
        height: h,
        opacity: 1,
        transition: { type: "spring", stiffness: 300, damping: 30 },
      }),
      resizing: (h: number) => ({ height: h, opacity: 1, transition: { duration: 0 } }),
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
    <motion.div
      className={cn("flex flex-col rounded-lg border overflow-hidden relative bg-muted/40", className)}
      style={{ borderColor }}
      custom={height}
      variants={cardVariants}
      initial="initial"
      animate={isResizing ? "resizing" : "open"}
      exit="closed"
    >
      <div className="flex items-center justify-between pl-4 pr-2 py-1.5 border-b border-border shrink-0">
        <span className="text-xs">Signal events</span>
        <Button variant="ghost" className="h-6 w-6 p-0" onClick={onClose}>
          <X className="size-3.5" />
        </Button>
      </div>
      {/* `[&>div>div]:!block` — Radix wraps Viewport children in a div with
          inline `display:table; min-width:100%`, which lets the wrapper grow
          past the panel width whenever any descendant is wider than 100%
          (truncating chevrons + spilling expanded content right). Forcing
          `display:block` keeps the wrapper at 100% and lets normal flex/wrap
          rules apply. */}
      <ScrollArea className="flex-1 min-h-0 [&>div>div]:!block">
        {isTraceSignalsLoading ? (
          <div className="flex items-center justify-center py-3 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : traceSignals.length === 0 ? (
          <div className="flex items-center justify-center py-3 text-xs text-muted-foreground">
            No signals associated with this trace
          </div>
        ) : (
          traceSignals.map((signal) => (
            <SignalRow
              key={signal.signalId}
              traceId={traceId}
              signal={signal}
              expanded={expandedId === signal.signalId}
              onToggle={() => handleToggle(signal.signalId)}
            />
          ))
        )}
      </ScrollArea>
      <div
        onMouseDown={handleMouseDown}
        className="h-1 cursor-row-resize hover:bg-[#18181B] transition-colors shrink-0 absolute bottom-0 w-full"
      />
    </motion.div>
  );
}
