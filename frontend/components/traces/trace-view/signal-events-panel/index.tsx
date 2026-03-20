"use client";

import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

import { jsonSchemaToSchemaFields } from "@/components/signals/utils";
import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { type TraceSignal } from "@/components/traces/trace-view/store/base";
import { type EventRow } from "@/lib/events/types";

import SignalTab from "./signal-tab";
import SignalTabBar from "./signal-tab-bar";

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

  const {
    traceSignals,
    isTraceSignalsLoading,
    activeSignalTabId,
    setTraceSignals,
    setIsTraceSignalsLoading,
    setActiveSignalTabId,
  } = useTraceViewStore((state) => ({
    traceSignals: state.traceSignals,
    isTraceSignalsLoading: state.isTraceSignalsLoading,
    activeSignalTabId: state.activeSignalTabId,
    setTraceSignals: state.setTraceSignals,
    setIsTraceSignalsLoading: state.setIsTraceSignalsLoading,
    setActiveSignalTabId: state.setActiveSignalTabId,
  }));

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

      const mapped: TraceSignal[] = data.map((s) => ({
        signalId: s.signalId,
        signalName: s.signalName,
        prompt: s.prompt,
        schemaFields: jsonSchemaToSchemaFields(s.structuredOutput).map((f) => ({
          name: f.name,
          type: f.type,
          description: f.description,
        })),
        events: s.events,
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

  if (isTraceSignalsLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  if (traceSignals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <span className="text-sm">No signals associated with this trace</span>
      </div>
    );
  }

  const tabs = traceSignals.map((s) => ({ id: s.signalId, name: s.signalName }));
  const activeSignal = traceSignals.find((s) => s.signalId === activeSignalTabId) ?? traceSignals[0];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <SignalTabBar tabs={tabs} activeTabId={activeSignalTabId} onTabSelect={setActiveSignalTabId} />
      {activeSignal && (
        <SignalTab
          key={activeSignal.signalId}
          signalId={activeSignal.signalId}
          signalName={activeSignal.signalName}
          prompt={activeSignal.prompt}
          structuredOutput={activeSignal.schemaFields.reduce(
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
          events={activeSignal.events as EventRow[]}
        />
      )}
    </div>
  );
}
