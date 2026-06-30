"use client";

import { TooltipPortal } from "@radix-ui/react-tooltip";
import { Loader2, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { shallow } from "zustand/shallow";

import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import SignalDetails from "./signal-details";

interface Props {
  traceId: string;
  onClose: () => void;
}

const MIN_BODY_HEIGHT = 120;
const MAX_BODY_HEIGHT = 320;

export default function PanelBody({ traceId, onClose }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState<number | null>(null);
  const resizedRef = useRef(false);

  // Initialize to content height (capped at max) once, before paint.
  useLayoutEffect(() => {
    if (resizedRef.current || bodyHeight !== null || !contentRef.current) return;
    const measured = contentRef.current.scrollHeight;
    setBodyHeight(Math.min(MAX_BODY_HEIGHT, Math.max(MIN_BODY_HEIGHT, measured)));
  });

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const startHeight = bodyHeight ?? contentRef.current?.scrollHeight ?? MIN_BODY_HEIGHT;
      resizedRef.current = true;

      const onMove = (moveEvent: MouseEvent) => {
        const next = startHeight + (moveEvent.clientY - startY);
        setBodyHeight(Math.min(MAX_BODY_HEIGHT, Math.max(MIN_BODY_HEIGHT, next)));
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [bodyHeight]
  );

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

  const searchParams = useSearchParams();
  const highlightedEventId = searchParams.get("eventId");

  const effectiveTabId = useMemo(() => {
    if (activeSignalTabId && traceSignals.some((s) => s.signalId === activeSignalTabId)) {
      return activeSignalTabId;
    }
    // A deep link with eventId points at one specific finding — surface the
    // signal tab that owns it so the highlighted card is visible on open.
    if (highlightedEventId) {
      const owner = traceSignals.find((s) => s.events.some((e) => e.id === highlightedEventId));
      if (owner) return owner.signalId;
    }
    if (initialSignalId && traceSignals.some((s) => s.signalId === initialSignalId)) {
      return initialSignalId;
    }
    return traceSignals[0]?.signalId ?? "";
  }, [activeSignalTabId, highlightedEventId, initialSignalId, traceSignals]);

  const isSingleSignal = traceSignals.length === 1;
  const activeSignal = traceSignals.find((s) => s.signalId === effectiveTabId);

  const closeButton = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" className="h-6 w-6 p-0 shrink-0" onClick={onClose}>
          <X className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent side="top">Close</TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );

  return (
    <div className="flex flex-col rounded-md border bg-blue-400/12 overflow-hidden border-blue-400/30">
      {isTraceSignalsLoading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
        </div>
      ) : (
        <Tabs value={effectiveTabId} onValueChange={setActiveSignalTabId} className="flex flex-col gap-0">
          <TooltipProvider delayDuration={300}>
            <div className="shrink-0 flex items-center gap-2 justify-between px-2 py-1 bg-blue-400/12">
              {isSingleSignal && activeSignal ? (
                <span className="flex items-center min-w-0 pl-1 text-xs font-medium">
                  <span className="truncate">{activeSignal.signalName}</span>
                </span>
              ) : (
                <TabsList className="flex-1 min-w-0 h-auto bg-transparent p-0 gap-1 justify-start">
                  {traceSignals.map((signal) => (
                    <TabsTrigger
                      key={signal.signalId}
                      value={signal.signalId}
                      className={cn(
                        "flex-1 min-w-0 h-auto px-2 py-1 text-xs rounded-md",
                        "data-[state=active]:bg-gray-900 data-[state=active]:shadow-none data-[state=active]:text-foreground",
                        "text-secondary-foreground hover:text-foreground"
                      )}
                    >
                      <span className="block w-full truncate text-center">{signal.signalName}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              )}
              {closeButton}
            </div>
          </TooltipProvider>
          <ScrollArea
            className="[&>div>div]:!block [&>[data-radix-scroll-area-viewport]]:!h-full"
            style={bodyHeight !== null ? { height: bodyHeight } : undefined}
          >
            <div ref={contentRef}>
              {traceSignals.map((signal) => (
                <TabsContent
                  key={signal.signalId}
                  value={signal.signalId}
                  className="m-0 outline-none data-[state=inactive]:hidden"
                >
                  <SignalDetails traceId={traceId} signal={signal} />
                </TabsContent>
              ))}
            </div>
          </ScrollArea>
          <div
            role="separator"
            aria-orientation="horizontal"
            onMouseDown={handleResizeMouseDown}
            className="group h-1.5 shrink-0 cursor-row-resize flex items-center justify-center hover:bg-blue-300/10 transition-colors"
          >
            <div className="h-0.5 w-8 rounded-full bg-primary-foreground/20" />
          </div>
        </Tabs>
      )}
    </div>
  );
}
