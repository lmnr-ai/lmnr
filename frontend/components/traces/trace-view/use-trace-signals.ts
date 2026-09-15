"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { shallow } from "zustand/shallow";

import { jsonSchemaToSchemaFields } from "@/components/signals/utils";
import { useTraceViewStore } from "@/components/traces/trace-view/store";
import {
  type TraceSignal,
  type TraceSignalClusterNode,
  type TraceSignalEvent,
} from "@/components/traces/trace-view/store/base";
import { useToast } from "@/lib/hooks/use-toast";

/** Wire shape of both signal endpoints. `prompt` is absent on the shared one —
 *  nothing renders it, so the public route withholds it. */
type TraceSignalResponse = {
  signalId: string;
  signalName: string;
  prompt?: string;
  structuredOutput: Record<string, unknown>;
  events: Array<
    Omit<TraceSignalEvent, "leafClusters"> & {
      leafClusters?: TraceSignalClusterNode[] | null;
    }
  >;
};

/**
 * Fetches a trace's signal events once, populates the store and auto-opens the
 * panel when there are any. Pass null while the ids the endpoint needs are still
 * missing — the fetch is one-shot per mount, so it will not run later.
 *
 * Tab selection prefers the signal owning a deep-linked `eventId`, then the
 * store's `initialSignalId` (set at store creation), then the first signal.
 */
export const useTraceSignals = (endpoint: string | null) => {
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const { setTraceSignals, setIsTraceSignalsLoading, setSignalsPanelOpen, setActiveSignalTabId, initialSignalId } =
    useTraceViewStore(
      (state) => ({
        setTraceSignals: state.setTraceSignals,
        setIsTraceSignalsLoading: state.setIsTraceSignalsLoading,
        setSignalsPanelOpen: state.setSignalsPanelOpen,
        setActiveSignalTabId: state.setActiveSignalTabId,
        initialSignalId: state.initialSignalId,
      }),
      shallow
    );

  useEffect(() => {
    if (!endpoint) return;

    const fetchSignals = async () => {
      try {
        setIsTraceSignalsLoading(true);
        const response = await fetch(endpoint);
        if (!response.ok) {
          const errMessage = await response
            .json()
            .then((d) => d?.error)
            .catch(() => null);
          toast({
            variant: "destructive",
            title: errMessage ?? "Failed to load trace signals",
          });
          return;
        }

        const data = (await response.json()) as TraceSignalResponse[];
        if (!Array.isArray(data)) return;

        const mapped: TraceSignal[] = data.map((s) => ({
          signalId: s.signalId,
          signalName: s.signalName,
          prompt: s.prompt ?? "",
          schemaFields: jsonSchemaToSchemaFields(s.structuredOutput).map((f) => ({
            name: f.name,
            type: f.type,
            description: f.description,
          })),
          events: Array.isArray(s.events)
            ? s.events.map((e) => ({
                id: e.id,
                signalId: e.signalId,
                traceId: e.traceId,
                payload: e.payload,
                severity: e.severity,
                leafClusters: e.leafClusters ?? [],
              }))
            : [],
        }));

        setTraceSignals(mapped);

        if (mapped.length > 0) {
          setSignalsPanelOpen(true);
          const eventId = searchParams.get("eventId");
          const owner = eventId ? mapped.find((s) => s.events.some((e) => e.id === eventId)) : undefined;
          const preferred = initialSignalId ? mapped.find((s) => s.signalId === initialSignalId) : undefined;
          setActiveSignalTabId(owner?.signalId ?? preferred?.signalId ?? mapped[0].signalId);
        }
      } catch {
        toast({
          variant: "destructive",
          title: "Failed to load trace signals",
        });
      } finally {
        setIsTraceSignalsLoading(false);
      }
    };

    fetchSignals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};
