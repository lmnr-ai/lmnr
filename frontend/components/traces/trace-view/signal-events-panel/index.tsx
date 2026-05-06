"use client";

import { motion } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { shallow } from "zustand/shallow";

import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import ExpandedContent from "./expanded-content";
import { getSignalDisplayColor } from "./utils";

const DEFAULT_HEIGHT = 280;
const MIN_HEIGHT = 120;
const MAX_HEIGHT = 600;
const FALLBACK_BORDER = "hsl(var(--border))";

interface Props {
  traceId: string;
  onClose: () => void;
  className?: string;
}

export default function SignalEventsPanel({ traceId, onClose, className }: Props) {
  const { traceSignals, isTraceSignalsLoading, activeSignalTabId, setActiveSignalTabId, initialSignalId } =
    useTraceViewStore(
      (state) => ({
        traceSignals: state.traceSignals,
        isTraceSignalsLoading: state.isTraceSignalsLoading,
        activeSignalTabId: state.activeSignalTabId,
        setActiveSignalTabId: state.setActiveSignalTabId,
        initialSignalId: state.initialSignalId,
      }),
      shallow
    );

  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [isResizing, setIsResizing] = useState(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  // Effective active tab: store value → initialSignalId fallback → first signal.
  const effectiveTabId = useMemo(() => {
    if (activeSignalTabId && traceSignals.some((s) => s.signalId === activeSignalTabId)) {
      return activeSignalTabId;
    }
    if (initialSignalId && traceSignals.some((s) => s.signalId === initialSignalId)) {
      return initialSignalId;
    }
    return traceSignals[0]?.signalId ?? "";
  }, [activeSignalTabId, initialSignalId, traceSignals]);

  const activeSignal = traceSignals.find((s) => s.signalId === effectiveTabId);
  // Single accent color drives all tinting: outer border (80%), active tab bg
  // (~25%), button & badge borders (~40%). Lets the panel adopt the color of
  // whichever signal is currently selected.
  const accentBase = activeSignal ? getSignalDisplayColor(activeSignal) : null;
  const borderColor = accentBase ? `${accentBase}60` : FALLBACK_BORDER;
  const tabActiveBg = accentBase ? `${accentBase}40` : "transparent"; // ~25%
  const accentBorder = accentBase ? `${accentBase}66` : "hsl(var(--border))"; // ~40%
  const panelTint = accentBase ? `${accentBase}1a` : undefined; // ~10%

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

  if (!isTraceSignalsLoading && traceSignals.length === 0) {
    // Nothing to show — don't render the panel at all.
    return null;
  }

  return (
    <motion.div
      className={cn("flex flex-col rounded-lg border overflow-hidden relative", className)}
      style={{ borderColor, backgroundColor: panelTint ?? "hsl(var(--muted) / 0.4)" }}
      custom={height}
      variants={cardVariants}
      initial="initial"
      animate={isResizing ? "resizing" : "open"}
      exit="closed"
    >
      {isTraceSignalsLoading ? (
        <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
        </div>
      ) : (
        <Tabs
          value={effectiveTabId}
          onValueChange={setActiveSignalTabId}
          className="flex flex-col flex-1 min-h-0 gap-0"
        >
          <div className="flex items-center gap-2 pl-2 pr-3 py-2 shrink-0">
            <TabsList className="flex-1 h-auto bg-transparent p-0 gap-1 justify-start">
              {traceSignals.map((signal) => {
                const isActive = signal.signalId === effectiveTabId;
                return (
                  <TabsTrigger
                    key={signal.signalId}
                    value={signal.signalId}
                    style={isActive ? { backgroundColor: tabActiveBg } : undefined}
                    className={cn(
                      "flex-1 min-w-0 h-auto px-2 py-0.5 text-xs rounded justify-center",
                      "data-[state=active]:shadow-none data-[state=active]:text-foreground",
                      "text-secondary-foreground hover:text-foreground"
                    )}
                  >
                    <span className="truncate">{signal.signalName}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
            <Button variant="ghost" className="h-6 w-6 p-0 shrink-0" onClick={onClose}>
              <X className="size-3.5" />
            </Button>
          </div>
          {/* `[&>div>div]:!block` — see Radix ScrollArea overflow note in old
              accordion build; same fix prevents long content from forcing
              horizontal scroll. */}
          <ScrollArea className="flex-1 min-h-0 [&>div>div]:!block">
            {traceSignals.map((signal) => (
              <TabsContent
                key={signal.signalId}
                value={signal.signalId}
                className="m-0 outline-none data-[state=inactive]:hidden"
              >
                <ExpandedContent traceId={traceId} signal={signal} accentBorder={accentBorder} />
              </TabsContent>
            ))}
          </ScrollArea>
        </Tabs>
      )}
      <div
        onMouseDown={handleMouseDown}
        className="h-1 cursor-row-resize hover:bg-[#18181B] transition-colors shrink-0 absolute bottom-0 w-full"
      />
    </motion.div>
  );
}
