"use client";

import { Loader2, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

import { jsonSchemaToSchemaFields } from "@/components/signals/utils";
import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { type TraceSignal } from "@/components/traces/trace-view/store/base";
import { Button } from "@/components/ui/button";
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

export default function SignalEventsPanel({ traceId, onClose }: { traceId: string; onClose?: () => void }) {
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

      // Auto-select first tab
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

  const header = (
    <div className="flex items-center justify-between px-2 pt-2 pb-2 flex-shrink-0">
      <span className="text-base font-medium ml-2">Signal Events</span>
      {onClose && (
        <Button variant="ghost" className="px-0.5 h-6 w-6" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      )}
    </div>
  );

  if (isTraceSignalsLoading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {header}
        <div className="flex flex-col items-center justify-center flex-1 text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
        </div>
      </div>
    );
  }

  if (traceSignals.length === 0) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {header}
        <div className="flex flex-col items-center justify-center flex-1 text-xs text-muted-foreground py-3">
          No signals associated with this trace
        </div>
      </div>
    );
  }

  const tabs = [
    ...traceSignals.map((s) => ({ id: s.signalId, name: s.signalName })),
    { id: "dummy-1", name: "Dummy Signal Alpha" },
    { id: "dummy-2", name: "Dummy Signal Beta" },
    { id: "dummy-3", name: "Dummy Signal Gamma Delta" },
    { id: "dummy-4", name: "Dummy Signal Epsilon" },
    { id: "dummy-5", name: "Dummy Signal Zeta Theta" },
  ];

  const effectiveTabId = activeSignalTabId ?? traceSignals[0]?.signalId ?? "";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {header}
      <Tabs
        value={effectiveTabId}
        onValueChange={setActiveSignalTabId}
        className="flex flex-col flex-1 min-h-0 overflow-hidden"
      >
        <TabsList className="flex-shrink-0 overflow-x-auto no-scrollbar h-8 w-full justify-start rounded-none border-b px-1">
          {tabs.map((tab) => (
            <TooltipProvider key={tab.id} delayDuration={500}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger value={tab.id} className="min-w-[120px] max-w-[120px] truncate text-xs">
                    {tab.name}
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{tab.name}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
        </TabsList>
        {traceSignals.map((signal) => (
          <TabsContent key={signal.signalId} value={signal.signalId} className="flex-1 min-h-0 overflow-y-auto m-0">
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
