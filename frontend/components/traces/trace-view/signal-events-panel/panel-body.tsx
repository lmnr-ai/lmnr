"use client";

import { TooltipPortal } from "@radix-ui/react-tooltip";
import { Loader2, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { shallow } from "zustand/shallow";

import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ElevatedSurface } from "@/components/ui/surface";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const handle = e.currentTarget;
      const startY = e.clientY;
      const startHeight = bodyHeight ?? contentRef.current?.scrollHeight ?? MIN_BODY_HEIGHT;
      resizedRef.current = true;
      // Capture the pointer so move/up survive the cursor crossing an iframe
      // (custom renderer) mid-drag; document listeners go silent over iframes.
      handle.setPointerCapture(e.pointerId);

      const onMove = (moveEvent: PointerEvent) => {
        const next = startHeight + (moveEvent.clientY - startY);
        setBodyHeight(Math.min(MAX_BODY_HEIGHT, Math.max(MIN_BODY_HEIGHT, next)));
      };
      const onUp = () => {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onUp);
      };
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onUp);
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
    <Tooltip delayDuration={400}>
      <TooltipTrigger asChild>
        <Button
          aria-label="Close"
          variant="ghost"
          size="icon-sm"
          className="shrink-0 hover:bg-surface-up"
          onClick={onClose}
        >
          <X className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent side="top">Close</TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );

  return (
    <ElevatedSurface offset={1} className="flex flex-col rounded-lg border overflow-hidden">
      {isTraceSignalsLoading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
        </div>
      ) : (
        <Tabs value={effectiveTabId} onValueChange={setActiveSignalTabId} className="flex flex-col gap-0">
          <div className="shrink-0 flex items-center gap-2 justify-between px-2 py-1.5">
            {isSingleSignal && activeSignal ? (
              <span className="min-w-0 truncate pl-1 text-xs font-medium">{activeSignal.signalName}</span>
            ) : (
              <TabsList size="sm" className="min-w-0 max-w-full justify-start overflow-x-auto">
                {traceSignals.map((signal) => (
                  <TabsTrigger key={signal.signalId} value={signal.signalId} className="shrink-0">
                    <span className="max-w-40 truncate">{signal.signalName}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            )}
            {closeButton}
          </div>
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
            onPointerDown={handleResizePointerDown}
            className="group h-1.5 shrink-0 cursor-row-resize flex items-center justify-center hover:bg-surface-up transition-colors"
          >
            <div className="h-0.5 w-8 rounded-full bg-border" />
          </div>
        </Tabs>
      )}
    </ElevatedSurface>
  );
}
