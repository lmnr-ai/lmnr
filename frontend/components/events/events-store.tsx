"use client";
import { createContext, PropsWithChildren, useContext, useRef } from "react";
import { createStore, useStore } from "zustand";

import { ManageEventDefinitionForm } from "@/components/event-definitions/manage-event-definition-sheet.tsx";
import { EventClusterConfig } from "@/lib/actions/cluster-configs";
import { EventDefinition } from "@/lib/actions/event-definitions";
import { SemanticEventDefinition } from "@/lib/actions/semantic-event-definitions";
import { EventRow } from "@/lib/events/types";

export type EventsStatsDataPoint = {
  timestamp: string;
  count: number;
} & Record<string, number>;

export type EventsState = {
  events?: EventRow[];
  totalCount: number;
  eventDefinition: ManageEventDefinitionForm;
  traceId: string | null;
  spanId: string | null;
  stats?: EventsStatsDataPoint[];
  isLoadingStats: boolean;
  chartContainerWidth: number | null;
  clusterConfig?: EventClusterConfig;
};

export type EventsActions = {
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
}

export type EventsStore = EventsState & EventsActions;

export type EventsStoreApi = ReturnType<typeof createEventsStore>;

export const createEventsStore = (initProps: EventsProps) =>
  createStore<EventsStore>()((set, get) => ({
    totalCount: 0,
    traceId: initProps.traceId || null,
    spanId: initProps.spanId || null,
    stats: undefined,
    isLoadingStats: false,
    chartContainerWidth: null,
    clusterConfig: initProps.clusterConfig,
    eventDefinition: {
      ...initProps.eventDefinition,
      structuredOutput:
        initProps.eventDefinition.structuredOutput != null
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

export const EventsContext = createContext<EventsStoreApi | null>(null);

export const useEventsStoreContext = <T,>(selector: (state: EventsStore) => T): T => {
  const store = useContext(EventsContext);
  if (!store) throw new Error("Missing EventsContext.Provider in the tree");
  return useStore(store, selector);
};

export const EventsStoreProvider = ({ children, ...props }: PropsWithChildren<EventsProps>) => {
  const storeRef = useRef<EventsStoreApi | undefined>(undefined);
  if (!storeRef.current) {
    storeRef.current = createEventsStore(props);
  }

  return <EventsContext.Provider value={storeRef.current}>{children}</EventsContext.Provider>;
};
