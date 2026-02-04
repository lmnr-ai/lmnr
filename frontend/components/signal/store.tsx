"use client";
import { createContext, type Dispatch, type PropsWithChildren, type SetStateAction, useContext, useRef } from "react";
import { createStore, useStore } from "zustand";

import { type ManageSignalForm } from "@/components/signals/manage-signal-sheet.tsx";
import { jsonSchemaToSchemaFields } from "@/components/signals/utils";
import { type Filter } from "@/lib/actions/common/filters.ts";
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
  runsFilters: Filter[];
  jobsFilters: Filter[];
  triggersFilters: Filter[];
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
  setRunsFilters: Dispatch<SetStateAction<Filter[]>>;
  setJobsFilters: Dispatch<SetStateAction<Filter[]>>;
  setTriggersFilters: Dispatch<SetStateAction<Filter[]>>;
};

export interface EventsProps {
  signal: Signal;
  traceId?: string | null;
  spanId?: string | null;
  lastEvent?: {
    name: string;
    id: string;
    timestamp: string;
  };
  initialTraceViewWidth?: number;
}

export type Store = SignalState & SignalActions;

export type SignalStoreApi = ReturnType<typeof createSignalStore>;

export const createSignalStore = (initProps: EventsProps) =>
  createStore<Store>()((set, get) => ({
    totalCount: 0,
    traceId: initProps.traceId || null,
    spanId: initProps.spanId || null,
    runsFilters: [],
    jobsFilters: [],
    triggersFilters: [],
    lastEvent: initProps.lastEvent,
    initialTraceViewWidth: initProps.initialTraceViewWidth,
    stats: undefined,
    isLoadingStats: false,
    chartContainerWidth: null,
    signal: {
      ...initProps.signal,
      prompt: initProps.signal.prompt,
      schemaFields: jsonSchemaToSchemaFields(initProps.signal.structuredOutput as Record<string, unknown>),
    },
    setSignal: (signal) => set({ signal }),
    setTraceId: (traceId) => set({ traceId }),
    setSpanId: (spanId) => set({ spanId }),
    setChartContainerWidth: (width: number) => set({ chartContainerWidth: width }),
    setRunsFilters: (filters) =>
      set((state) => ({
        runsFilters: typeof filters === "function" ? filters(state.runsFilters) : filters,
      })),
    setJobsFilters: (filters) =>
      set((state) => ({
        jobsFilters: typeof filters === "function" ? filters(state.jobsFilters) : filters,
      })),
    setTriggersFilters: (filters) =>
      set((state) => ({
        triggersFilters: typeof filters === "function" ? filters(state.triggersFilters) : filters,
      })),
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
    storeRef.current = createSignalStore(props);
  }

  return <SignalContext.Provider value={storeRef.current}>{children}</SignalContext.Provider>;
};
