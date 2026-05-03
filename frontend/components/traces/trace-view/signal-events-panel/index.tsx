"use client";

import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import { getSignalColor } from "@/components/signals/utils";
import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { cn } from "@/lib/utils";

import SinglePanel from "./single-panel";
import TabsPanel from "./tabs-panel";

const DEFAULT_HEIGHT = 200;
const MIN_HEIGHT = 80;
const MAX_HEIGHT = 500;

interface Props {
  traceId: string;
  onClose: () => void;
  className?: string;
}

export default function SignalEventsPanel({ traceId, onClose, className }: Props) {
  const traceSignals = useTraceViewStore((state) => state.traceSignals);
  const isTraceSignalsLoading = useTraceViewStore((state) => state.isTraceSignalsLoading);
  const activeSignalTabId = useTraceViewStore((state) => state.activeSignalTabId);
  const setActiveSignalTabId = useTraceViewStore((state) => state.setActiveSignalTabId);

  const activeColor = useMemo(() => {
    const active = traceSignals.find((s) => s.signalId === activeSignalTabId);
    return getSignalColor(active?.signalId, active?.color);
  }, [traceSignals, activeSignalTabId]);

  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [isResizing, setIsResizing] = useState(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

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
    <motion.div
      className={cn("flex flex-col rounded-lg border overflow-hidden relative bg-muted/60", className)}
      style={{ borderColor: `${activeColor}80` }}
      custom={height}
      variants={cardVariants}
      initial="initial"
      animate={isResizing ? "resizing" : "open"}
      exit="closed"
    >
      <div
        className="flex flex-col flex-1 min-h-0 overflow-hidden px-2 pt-1.5"
        style={{ backgroundColor: `${activeColor}05` }}
      >
        {isTraceSignalsLoading ? (
          <div className="flex items-center justify-center py-3 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : traceSignals.length === 0 ? (
          <div className="flex items-center justify-center py-3 text-xs text-muted-foreground">
            No signals associated with this trace
          </div>
        ) : traceSignals.length === 1 ? (
          <SinglePanel traceId={traceId} signal={traceSignals[0]} onClose={onClose} />
        ) : (
          <TabsPanel
            traceId={traceId}
            traceSignals={traceSignals}
            activeSignalTabId={activeSignalTabId}
            setActiveSignalTabId={setActiveSignalTabId}
            onClose={onClose}
          />
        )}
      </div>
      <div
        onMouseDown={handleMouseDown}
        className="h-1 cursor-row-resize flex items-center justify-center hover:bg-muted transition-colors shrink-0 absolute bottom-0 w-full"
      />
    </motion.div>
  );
}
