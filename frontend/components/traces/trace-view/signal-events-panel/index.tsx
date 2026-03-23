"use client";

import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

import { jsonSchemaToSchemaFields } from "@/components/signals/utils";
import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { type TraceSignal } from "@/components/traces/trace-view/store/base";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type EventRow } from "@/lib/events/types";

import SignalTab from "./signal-tab";

interface ApiSignalResponse {
  signalId: string;
  signalName: string;
  prompt: string;
  structuredOutput: Record<string, unknown>;
  events: EventRow[];
}

export default function SignalEventsPanel({ traceId }: { traceId: string }) {
  const { projectId } = useParams();
  const hasFetchedRef = useRef(false);

  const traceSignals = useTraceViewStore((state) => state.traceSignals);
  const isTraceSignalsLoading = useTraceViewStore((state) => state.isTraceSignalsLoading);
  const activeSignalTabId = useTraceViewStore((state) => state.activeSignalTabId);
  const setTraceSignals = useTraceViewStore((state) => state.setTraceSignals);
  const setIsTraceSignalsLoading = useTraceViewStore((state) => state.setIsTraceSignalsLoading);
  const setActiveSignalTabId = useTraceViewStore((state) => state.setActiveSignalTabId);

  const fetchSignals = useCallback(async () => {
    if (hasFetchedRef.current || traceSignals.length > 0) return;
    hasFetchedRef.current = true;

    try {
      setIsTraceSignalsLoading(true);
      const response = await fetch(`/api/projects/${projectId}/traces/${traceId}/signals`);

      if (!response.ok) {
        console.error("Failed to fetch trace signals");
        return;
      }

      const data = (await response.json()) as ApiSignalResponse[];

      if (!Array.isArray(data)) {
        console.error("Unexpected response format for trace signals");
        return;
      }

      const mapped: TraceSignal[] = data.map((s) => ({
        signalId: s.signalId,
        signalName: s.signalName,
        prompt: s.prompt ?? "",
        schemaFields: jsonSchemaToSchemaFields(s.structuredOutput).map((f) => ({
          name: f.name,
          type: f.type,
          description: f.description,
        })),
        events: Array.isArray(s.events) ? s.events : [],
      }));

      setTraceSignals(mapped);

      if (mapped.length > 0 && !activeSignalTabId) {
        setActiveSignalTabId(mapped[0].signalId);
      }
    } catch (error) {
      console.error("Error fetching trace signals:", error);
    } finally {
      setIsTraceSignalsLoading(false);
    }
  }, [
    projectId,
    traceId,
    traceSignals.length,
    activeSignalTabId,
    setTraceSignals,
    setIsTraceSignalsLoading,
    setActiveSignalTabId,
  ]);

  useEffect(() => {
    fetchSignals();
  }, [fetchSignals]);

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
      className="flex flex-col flex-1 min-h-0 overflow-hidden rounded-md border bg-card gap-0"
    >
      <div className="flex-shrink-0 px-2 pt-1.5 pb-1 text-xs font-medium text-secondary-foreground">Signal events</div>
      <TabsList className="flex-shrink-0 overflow-x-auto no-scrollbar h-8 w-full justify-start rounded-none border-b px-1">
        {traceSignals.map((signal) => (
          <TooltipProvider key={signal.signalId} delayDuration={500}>
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTrigger
                  value={signal.signalId}
                  className="min-w-[120px] max-w-[120px] truncate text-xs text-left justify-start"
                >
                  {signal.signalName}
                </TabsTrigger>
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
          className="flex flex-col flex-1 min-h-0 overflow-hidden m-0"
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
