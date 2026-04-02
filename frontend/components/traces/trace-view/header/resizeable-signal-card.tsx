import { motion } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import { SIGNAL_COLORS } from "@/components/signals/utils";
import SignalTab from "@/components/traces/trace-view/signal-events-panel/signal-tab";
import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type EventRow } from "@/lib/events/types";
import { cn } from "@/lib/utils";

const DEFAULT_SIGNAL_CARD_HEIGHT = 300;
const MIN_SIGNAL_CARD_HEIGHT = 80;
const MAX_SIGNAL_CARD_HEIGHT = 500;

export default function ResizableSignalCard({
  traceId,
  onClose,
  className,
}: {
  traceId: string;
  onClose: () => void;
  className?: string;
}) {
  const traceSignals = useTraceViewStore((state) => state.traceSignals);
  const isTraceSignalsLoading = useTraceViewStore((state) => state.isTraceSignalsLoading);
  const activeSignalTabId = useTraceViewStore((state) => state.activeSignalTabId);
  const setActiveSignalTabId = useTraceViewStore((state) => state.setActiveSignalTabId);

  const activeColor = useMemo(() => {
    const idx = traceSignals.findIndex((s) => s.signalId === activeSignalTabId);
    return SIGNAL_COLORS[Math.max(0, idx) % SIGNAL_COLORS.length];
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

  const effectiveTabId = activeSignalTabId ?? traceSignals[0]?.signalId ?? "";

  return (
    <motion.div
      className={cn("flex flex-col rounded-lg border bg-secondary/50 overflow-hidden relative", className)}
      style={{ borderColor: `${activeColor}80` }}
      custom={height}
      variants={cardVariants}
      initial="initial"
      animate={isResizing ? "resizing" : "open"}
      exit="closed"
    >
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden px-2 pt-1.5">
        {isTraceSignalsLoading ? (
          <div className="flex items-center justify-center py-3 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : traceSignals.length === 0 ? (
          <div className="flex items-center justify-center py-3 text-xs text-muted-foreground">
            No signals associated with this trace
          </div>
        ) : (
          <Tabs
            value={effectiveTabId}
            onValueChange={setActiveSignalTabId}
            className="flex flex-col flex-1 min-h-0 overflow-hidden gap-0"
          >
            <motion.div className="flex items-center gap-1 flex-shrink-0" layout layoutId="signals-panel-layout">
              <TabsList className="flex-1 h-8">
                {traceSignals.map((signal, i) => (
                  <TooltipProvider key={signal.signalId} delayDuration={500}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex-1 min-w-0">
                          <TabsTrigger value={signal.signalId} className="w-full text-xs overflow-hidden gap-1.5">
                            <motion.div
                              layout
                              layoutId={`trace-signals-layout-${signal.signalId}`}
                              className="size-2 flex-shrink-0"
                              style={{ backgroundColor: SIGNAL_COLORS[i % SIGNAL_COLORS.length], rotate: 45 }}
                              transition={{ layout: { type: "spring", stiffness: 300, damping: 30 } }}
                            />
                            <span className="block truncate">{signal.signalName}</span>
                          </TabsTrigger>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p>{signal.signalName}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
              </TabsList>
              <Button variant="ghost" className="h-6 w-6 p-0 flex-shrink-0" onClick={onClose}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </motion.div>
            {traceSignals.map((signal) => (
              <TabsContent
                key={signal.signalId}
                value={signal.signalId}
                className="flex-1 min-h-0 overflow-y-auto styled-scrollbar m-0"
              >
                <SignalTab
                  signalId={signal.signalId}
                  signalName={signal.signalName}
                  traceId={traceId}
                  prompt={signal.prompt}
                  structuredOutput={signal.schemaFields.reduce(
                    (acc, f) => {
                      if (f.name.trim()) {
                        acc.properties[f.name] = { type: f.type, description: f.description ?? "" };
                      }
                      return acc;
                    },
                    { type: "object", properties: {} } as {
                      type: string;
                      properties: Record<string, { type: string; description: string }>;
                    }
                  )}
                  events={(signal.events as EventRow[]) ?? []}
                />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
      <div
        onMouseDown={handleMouseDown}
        className="h-1 cursor-row-resize flex items-center justify-center hover:bg-muted transition-colors shrink-0 absolute bottom-0 w-full"
      />
    </motion.div>
  );
}
