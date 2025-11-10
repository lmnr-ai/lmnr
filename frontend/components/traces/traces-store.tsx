import { parseISO } from "date-fns";
import { createContext, PropsWithChildren, useContext, useRef } from "react";
import { createStore, useStore } from "zustand";

import { TracesStatsDataPoint } from "@/lib/actions/traces/stats";

export type TracesState = {
  traceId: string | null;
  spanId: string | null;
  stats?: TracesStatsDataPoint[];
  isLoadingStats: boolean;
  chartContainerWidth: number | null;
};

export type TracesActions = {
  setTraceId: (traceId: string | null) => void;
  setSpanId: (spanId: string | null) => void;
  fetchStats: (url: string) => Promise<void>;
  incrementStat: (timestamp: string, isError: boolean) => void;
  setChartContainerWidth: (width: number) => void;
};

export interface TracesProps {
  traceId: string | null;
  spanId: string | null;
}

export type TracesStore = TracesState & TracesActions;

export type TracesStoreApi = ReturnType<typeof createTracesStore>;

export const createTracesStore = (initProps?: Partial<TracesProps>) => {
  const DEFAULT_PROPS: TracesState = {
    traceId: null,
    spanId: null,
    stats: undefined,
    isLoadingStats: false,
    chartContainerWidth: null,
  };

  return createStore<TracesStore>()((set, get) => ({
    ...DEFAULT_PROPS,
    ...initProps,

    setTraceId: (traceId) => set({ traceId }),

    setSpanId: (spanId: string | null) => set({ spanId }),

    setChartContainerWidth: (width: number) => set({ chartContainerWidth: width }),

    fetchStats: async (url: string) => {
      set({ isLoadingStats: true });
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch stats: ${response.status} ${response.statusText}`);
        }
        const data = (await response.json()) as { items: TracesStatsDataPoint[] };
        set({ stats: data.items, isLoadingStats: false });
      } catch (error) {
        console.error("Failed to fetch stats:", error);
        set({ isLoadingStats: false });
      }
    },

    incrementStat: (timestamp: string, isError: boolean) => {
      const { stats } = get();
      if (!stats || stats?.length === 0) return;

      const traceTime = parseISO(timestamp);

      const bucketIndex = stats.findIndex((stat, idx) => {
        const bucketStart = parseISO(stat.timestamp);
        const bucketEnd = idx < stats.length - 1 ? parseISO(stats[idx + 1].timestamp) : new Date(8640000000000000);

        return traceTime >= bucketStart && traceTime < bucketEnd;
      });

      if (bucketIndex === -1) return;

      set({
        stats: stats.map((stat, idx) =>
          idx === bucketIndex
            ? {
              ...stat,
              successCount: isError ? stat.successCount : stat.successCount + 1,
              errorCount: isError ? stat.errorCount + 1 : stat.errorCount,
            }
            : stat
        ),
      });
    },
  }));
};

export const TracesContext = createContext<TracesStoreApi | null>(null);

export const useTracesStoreContext = <T,>(selector: (state: TracesStore) => T): T => {
  const store = useContext(TracesContext);
  if (!store) throw new Error("Missing TracesContext.Provider in the tree");
  return useStore(store, selector);
};

export const TracesStoreProvider = ({ children, ...props }: PropsWithChildren<TracesProps>) => {
  const storeRef = useRef<TracesStoreApi | undefined>(undefined);
  if (!storeRef.current) {
    storeRef.current = createTracesStore(props);
  }

  return <TracesContext.Provider value={storeRef.current}>{children}</TracesContext.Provider>;
};
