import { motion } from "framer-motion";
import { useCallback, useMemo, useRef, useState } from "react";

import { DEFAULT_SIGNAL_COLOR } from "@/components/signals/utils";
import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { cn } from "@/lib/utils";

import SignalEventsPanel from "../signal-events-panel";

const DEFAULT_SIGNAL_CARD_HEIGHT = 300;
const MIN_SIGNAL_CARD_HEIGHT = 80;
const MAX_SIGNAL_CARD_HEIGHT = 500;

interface Props {
  traceId: string;
  onClose: () => void;
  className?: string;
}

export default function ResizableSignalCard({ traceId, onClose, className }: Props) {
  const traceSignals = useTraceViewStore((state) => state.traceSignals);
  const activeSignalTabId = useTraceViewStore((state) => state.activeSignalTabId);

  const activeColor = useMemo(() => {
    const active = traceSignals.find((s) => s.signalId === activeSignalTabId);
    return active?.color ?? DEFAULT_SIGNAL_COLOR;
  }, [traceSignals, activeSignalTabId]);

  const [height, setHeight] = useState(DEFAULT_SIGNAL_CARD_HEIGHT);
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
        const newHeight = Math.min(
          MAX_SIGNAL_CARD_HEIGHT,
          Math.max(MIN_SIGNAL_CARD_HEIGHT, startHeight.current + delta)
        );
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
      className={cn("flex flex-col rounded-lg border bg-secondary/50 overflow-hidden relative", className)}
      style={{
        borderColor: `${activeColor}80`,
        backgroundColor: `${activeColor}10`,
      }}
      custom={height}
      variants={cardVariants}
      initial="initial"
      animate={isResizing ? "resizing" : "open"}
      exit="closed"
    >
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden px-2 pt-1.5">
        <SignalEventsPanel traceId={traceId} onClose={onClose} activeColor={activeColor} />
      </div>
      <div
        onMouseDown={handleMouseDown}
        className="h-1 cursor-row-resize flex items-center justify-center hover:bg-muted transition-colors shrink-0 absolute bottom-0 w-full"
      />
    </motion.div>
  );
}
