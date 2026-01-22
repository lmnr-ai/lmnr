"use client";
import { createContext, type PropsWithChildren, useContext, useRef } from "react";
import { createStore, useStore } from "zustand";

import { type ManageSignalForm } from "@/components/signals/manage-signal-sheet.tsx";
import { type SignalClusterConfig } from "@/lib/actions/cluster-configs";
import { type Signal } from "@/lib/actions/signals";
import { type EventRow } from "@/lib/events/types";

export type EventsStatsDataPoint = {
  timestamp: string;
  count: number;
} & Record<string, number>;

export type SignalState = {
  events?: EventRow[];
  totalCount: number;
  signal: Omit<ManageSignalForm, "id"> & { id: string };
  traceId: string | null;
  spanId: string | null;
  stats?: EventsStatsDataPoint[];
  isLoadingStats: boolean;
  chartContainerWidth: number | null;
  clusterConfig?: SignalClusterConfig;
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
  setSignal: (eventDefinition?: SignalState["signal"]) => void;
  fetchStats: (url: string) => Promise<void>;
  setChartContainerWidth: (width: number) => void;
  setClusterConfig: (config?: SignalClusterConfig) => void;
};

export interface EventsProps {
  signal: Signal;
  traceId?: string | null;
  spanId?: string | null;
  clusterConfig?: SignalClusterConfig;
  lastEvent?: {
    name: string;
    id: string;
    timestamp: string;
  };
  initialTraceViewWidth?: number;
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
    signal: {
      ...initProps.signal,
      prompt: initProps.signal.prompt,
      structuredOutput: JSON.stringify(initProps.signal.structuredOutput, null, 2),
      triggerSpans: initProps.signal.triggerSpans.map((name) => ({ name })),
    },
    setSignal: (signal) => set({ signal }),
    setTraceId: (traceId) => set({ traceId }),
    setSpanId: (spanId) => set({ spanId }),
    setChartContainerWidth: (width: number) => set({ chartContainerWidth: width }),
    setClusterConfig: (clusterConfig) => set({ clusterConfig }),
    fetchEvents: async (params: URLSearchParams) => {
      const { signal } = get();

      set({ events: undefined });

      try {
        const response = await fetch(`/api/projects/${signal.projectId}/events/${signal.name}?${params.toString()}`);
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

export const useSignalStoreContext = <T,>(selector: (state: Store) => T): T => {
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
