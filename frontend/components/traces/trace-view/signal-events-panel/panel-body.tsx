"use client";

import { Loader2, X } from "lucide-react";
import { useMemo } from "react";
import { shallow } from "zustand/shallow";

import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import ExpandedContent from "./expanded-content";
import { usePanelAccent } from "./utils";

interface Props {
  traceId: string;
  onClose: () => void;
}

/** The shared inner shell of the panel — used identically by both the
 *  HoverCard trigger (collapsed) and the HoverCardContent portal (expanded).
 *  The only thing that changes between the two is the `PanelHoverContext`
 *  value, which `ExpandedContent` reads to decide whether to show the
 *  toolbar. Outer border / background / sizing are owned by `index.tsx`. */
export default function PanelBody({ traceId, onClose }: Props) {
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

  const effectiveTabId = useMemo(() => {
    if (activeSignalTabId && traceSignals.some((s) => s.signalId === activeSignalTabId)) {
      return activeSignalTabId;
    }
    if (initialSignalId && traceSignals.some((s) => s.signalId === initialSignalId)) {
      return initialSignalId;
    }
    return traceSignals[0]?.signalId ?? "";
  }, [activeSignalTabId, initialSignalId, traceSignals]);

  const { tabActiveBg } = usePanelAccent();

  if (isTraceSignalsLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-6 text-xs text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }

  return (
    <Tabs value={effectiveTabId} onValueChange={setActiveSignalTabId} className="flex flex-col flex-1 min-h-0 gap-0">
      <div className="flex items-center gap-2 pl-2 pr-3 py-2 shrink-0">
        <TabsList className="flex-1 min-w-0 h-auto bg-transparent p-0 gap-1 justify-start">
          {traceSignals.map((signal) => {
            const isActive = signal.signalId === effectiveTabId;
            return (
              <TabsTrigger
                key={signal.signalId}
                value={signal.signalId}
                style={isActive ? { backgroundColor: tabActiveBg } : undefined}
                className={cn(
                  "flex-1 min-w-0 h-auto px-2 py-0.5 text-xs rounded",
                  "data-[state=active]:shadow-none data-[state=active]:text-foreground",
                  "text-secondary-foreground hover:text-foreground"
                )}
              >
                {/* `block w-full truncate` — `truncate` only renders ellipsis
                    on block-level boxes with constrained width. The default
                    inline span lets text overflow visibly even after the
                    trigger has shrunk via `flex-1 min-w-0`. */}
                <span className="block w-full truncate text-center">{signal.signalName}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>
        <Button variant="ghost" className="h-6 w-6 p-0 shrink-0" onClick={onClose}>
          <X className="size-3.5" />
        </Button>
      </div>
      {/* `[&>div>div]:!block` — Radix wraps Viewport children in a div with
          inline `display:table; min-width:100%`, which lets long content force
          horizontal overflow. Keep this override. */}
      <ScrollArea className="flex-1 min-h-0 [&>div>div]:!block">
        {traceSignals.map((signal) => (
          <TabsContent
            key={signal.signalId}
            value={signal.signalId}
            className="m-0 outline-none data-[state=inactive]:hidden"
          >
            <ExpandedContent traceId={traceId} signal={signal} />
          </TabsContent>
        ))}
      </ScrollArea>
    </Tabs>
  );
}
