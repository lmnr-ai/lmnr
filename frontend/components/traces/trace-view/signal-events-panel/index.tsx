"use client";

import { Loader2, X } from "lucide-react";

import { SIGNAL_COLORS } from "@/components/signals/utils";
import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type EventRow } from "@/lib/events/types";

import SignalTab from "./signal-tab";

export default function SignalEventsPanel({ traceId, onClose }: { traceId: string; onClose?: () => void }) {
  const traceSignals = useTraceViewStore((state) => state.traceSignals);
  const isTraceSignalsLoading = useTraceViewStore((state) => state.isTraceSignalsLoading);
  const activeSignalTabId = useTraceViewStore((state) => state.activeSignalTabId);
  const setActiveSignalTabId = useTraceViewStore((state) => state.setActiveSignalTabId);

  if (isTraceSignalsLoading) {
    return (
      <div className="flex items-center justify-center py-3 text-xs text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }

  if (traceSignals.length === 0) {
    return (
      <div className="flex items-center justify-center py-3 text-xs text-muted-foreground">
        No signals associated with this trace
      </div>
    );
  }

  const effectiveTabId = activeSignalTabId ?? traceSignals[0]?.signalId ?? "";

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden px-2 pt-1.5">
      <Tabs
        value={effectiveTabId}
        onValueChange={setActiveSignalTabId}
        className="flex flex-col flex-1 min-h-0 overflow-hidden gap-0"
      >
        <div className="flex items-center gap-1 flex-shrink-0">
          <TabsList className="flex-1 h-8">
            {traceSignals.map((signal, i) => (
              <TooltipProvider key={signal.signalId} delayDuration={500}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex-1 min-w-0">
                      <TabsTrigger value={signal.signalId} className="w-full text-xs overflow-hidden gap-1.5">
                        <div
                          className="size-2 rotate-45 flex-shrink-0"
                          style={{ backgroundColor: SIGNAL_COLORS[i % SIGNAL_COLORS.length] }}
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
          {onClose && (
            <Button variant="ghost" className="h-6 w-6 p-0 flex-shrink-0" onClick={onClose}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
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
    </div>
  );
}
