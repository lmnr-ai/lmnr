"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import useSWR from "swr";
import { shallow } from "zustand/shallow";

import { jsonSchemaToSchemaFields } from "@/components/signals/utils";
import { useTraceViewStore } from "@/components/traces/trace-view/store";
import {
  type TraceSignal,
  type TraceSignalClusterNode,
  type TraceSignalEvent,
} from "@/components/traces/trace-view/store/base";
import { useToast } from "@/lib/hooks/use-toast";
import { swrFetcher } from "@/lib/utils";

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

const toTraceSignal = (signal: TraceSignalResponse): TraceSignal => ({
  signalId: signal.signalId,
  signalName: signal.signalName,
  prompt: signal.prompt ?? "",
  schemaFields: jsonSchemaToSchemaFields(signal.structuredOutput).map((field) => ({
    name: field.name,
    type: field.type,
    description: field.description,
  })),
  events: Array.isArray(signal.events)
    ? signal.events.map((event) => ({
        id: event.id,
        signalId: event.signalId,
        traceId: event.traceId,
        payload: event.payload,
        severity: event.severity,
        leafClusters: event.leafClusters ?? [],
      }))
    : [],
});

/**
 * Fetches a trace's signal events, mirrors them into the store and auto-opens
 * the panel the first time there are any. Pass null while the ids the endpoint
 * needs are still missing.
 *
 * Tab selection prefers the signal owning a deep-linked `eventId`, then the
 * store's `initialSignalId` (set at store creation), then the first signal.
 */
export const useTraceSignals = (endpoint: string | null) => {
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const { setTraceSignals, setIsTraceSignalsLoading, initialSignalId } = useTraceViewStore(
    (state) => ({
      setTraceSignals: state.setTraceSignals,
      setIsTraceSignalsLoading: state.setIsTraceSignalsLoading,
      initialSignalId: state.initialSignalId,
    }),
    shallow
  );

  const { data, isLoading } = useSWR<TraceSignalResponse[]>(endpoint, swrFetcher, {
    // Retries call onError on every attempt; one toast per failure is enough.
    shouldRetryOnError: false,
    onError: (error: Error) =>
      toast({ variant: "destructive", title: error.message || "Failed to load trace signals" }),
  });

  const signals = useMemo(() => (Array.isArray(data) ? data.map(toTraceSignal) : []), [data]);

  useEffect(() => {
    setIsTraceSignalsLoading(isLoading);
  }, [isLoading, setIsTraceSignalsLoading]);

  // Whether this is the panel's first look is the store's call — it compares the
  // endpoint against the one it last offered itself for. Here we only identify the
  // fetch (one endpoint per trace) and name the tab that look should land on.
  useEffect(() => {
    if (!endpoint) return;
    const eventId = searchParams.get("eventId");
    const owner = eventId ? signals.find((s) => s.events.some((e) => e.id === eventId)) : undefined;
    const preferred = initialSignalId ? signals.find((s) => s.signalId === initialSignalId) : undefined;
    setTraceSignals(signals, endpoint, owner?.signalId ?? preferred?.signalId);
  }, [signals, endpoint, searchParams, initialSignalId, setTraceSignals]);
};
