"use client";
import { createContext, type PropsWithChildren, useContext, useRef } from "react";
import { createStore, useStore } from "zustand";

import { type ManageEventDefinitionForm } from "@/components/signals/manage-event-definition-sheet.tsx";
import { type EventClusterConfig } from "@/lib/actions/cluster-configs";
import { type EventDefinition } from "@/lib/actions/event-definitions";
import { type SemanticEventDefinition } from "@/lib/actions/semantic-event-definitions";
import { type EventRow } from "@/lib/events/types";

export type EventsStatsDataPoint = {
  timestamp: string;
  count: number;
} & Record<string, number>;

export type SignalState = {
  events?: EventRow[];
  totalCount: number;
  eventDefinition: ManageEventDefinitionForm;
  traceId: string | null;
  spanId: string | null;
  stats?: EventsStatsDataPoint[];
  isLoadingStats: boolean;
  chartContainerWidth: number | null;
  clusterConfig?: EventClusterConfig;
  isSignalsEnabled: boolean;
  initialTraceViewWidth?: number;
  lastEvent?: {
    name: string;
    id: string;
    timestamp: string;
  };
};

export type SignalActions = {
  setTraceId: (traceId: string | null) => void;
  setSpanId: (spanId: string | null) => void;
  fetchEvents: (params: URLSearchParams) => Promise<void>;
  setEventDefinition: (eventDefinition?: ManageEventDefinitionForm) => void;
  fetchStats: (url: string) => Promise<void>;
  setChartContainerWidth: (width: number) => void;
  setClusterConfig: (config?: EventClusterConfig) => void;
};

export interface EventsProps {
  eventDefinition: EventDefinition | SemanticEventDefinition;
  traceId?: string | null;
  spanId?: string | null;
  clusterConfig?: EventClusterConfig;
  lastEvent?: {
    name: string;
    id: string;
    timestamp: string;
  };
  initialTraceViewWidth?: number;
  isSignalsEnabled: boolean;
}

export type Store = SignalState & SignalActions;

export type SignalStoreApi = ReturnType<typeof createEventsStore>;

export const createEventsStore = (initProps: EventsProps) =>
  createStore<Store>()((set, get) => ({
    totalCount: 0,
    traceId: initProps.traceId || null,
    spanId: initProps.spanId || null,
    lastEvent: initProps.lastEvent,
    initialTraceViewWidth: initProps.initialTraceViewWidth,
    stats: undefined,
    isLoadingStats: false,
    chartContainerWidth: null,
    clusterConfig: initProps.clusterConfig,
    isSignalsEnabled: initProps.isSignalsEnabled,
    eventDefinition: {
      ...initProps.eventDefinition,
      prompt: "prompt" in initProps.eventDefinition ? initProps.eventDefinition.prompt : "",
      structuredOutput:
        "structuredOutput" in initProps.eventDefinition
          ? JSON.stringify(initProps.eventDefinition.structuredOutput, null, 2)
          : "",
      triggerSpans:
        "triggerSpans" in initProps.eventDefinition && initProps.eventDefinition.triggerSpans
          ? initProps.eventDefinition.triggerSpans.map((name) => ({ name }))
          : [],
    },
    setEventDefinition: (eventDefinition) => set({ eventDefinition }),
    setTraceId: (traceId) => set({ traceId }),
    setSpanId: (spanId) => set({ spanId }),
    setChartContainerWidth: (width: number) => set({ chartContainerWidth: width }),
    setClusterConfig: (clusterConfig) => set({ clusterConfig }),
    fetchEvents: async (params: URLSearchParams) => {
      const { eventDefinition } = get();

      set({ events: undefined });

      try {
        const response = await fetch(
          `/api/projects/${eventDefinition.projectId}/events/${eventDefinition.name}?${params.toString()}`
        );
        if (!response.ok) throw new Error("Failed to fetch events");
        const data: { items: EventRow[]; count: number } = await response.json();
        set({
          events: data.items,
          totalCount: data.count,
        });
      } catch (error) {
        set({ events: [], totalCount: 0 });
        console.error("Error fetching events:", error);
      }
    },
    fetchStats: async (url: string) => {
      set({ isLoadingStats: true });
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch stats: ${response.status} ${response.statusText}`);
        }
        const data = (await response.json()) as { items: EventsStatsDataPoint[] };
        set({ stats: data.items, isLoadingStats: false });
      } catch (error) {
        console.error("Failed to fetch event stats:", error);
        set({ isLoadingStats: false });
      }
    },
  }));

export const SignalContext = createContext<SignalStoreApi | null>(null);

export const useEventsStoreContext = <T,>(selector: (state: Store) => T): T => {
  const store = useContext(SignalContext);
  if (!store) throw new Error("Missing SignalContext.Provider in the tree");
  return useStore(store, selector);
};

export const SignalStoreProvider = ({ children, ...props }: PropsWithChildren<EventsProps>) => {
  const storeRef = useRef<SignalStoreApi | undefined>(undefined);
  if (!storeRef.current) {
    storeRef.current = createEventsStore(props);
  }

  return <SignalContext.Provider value={storeRef.current}>{children}</SignalContext.Provider>;
};
