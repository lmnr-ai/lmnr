"use client";

import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";

import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type EventRow } from "@/lib/events/types";

import SignalTab from "./signal-tab";

export default function SignalEventsPanel({ traceId }: { traceId: string }) {
  const { projectId } = useParams();

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
    <Tabs
      value={effectiveTabId}
      onValueChange={setActiveSignalTabId}
      className="flex flex-col flex-1 min-h-0 overflow-hidden gap-0"
    >
      <TabsList className="flex-shrink-0 overflow-x-scroll overflow-y-hidden styled-scrollbar w-full h-8 justify-start rounded-md px-1">
        {traceSignals.map((signal) => (
          <TooltipProvider key={signal.signalId} delayDuration={500}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <TabsTrigger
                    value={signal.signalId}
                    className="flex-1 min-w-[120px] text-xs text-left justify-start overflow-hidden"
                  >
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
  );
}
