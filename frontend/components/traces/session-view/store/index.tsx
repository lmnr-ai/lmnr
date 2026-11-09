import React, { createContext, type PropsWithChildren, useContext, useState } from "react";
import { createStore, type StoreApi } from "zustand";
import { persist } from "zustand/middleware";
import { useStoreWithEqualityFn } from "zustand/traditional";

import { MAX_ZOOM, MIN_ZOOM } from "@/components/traces/trace-view/store";
import { type Filter } from "@/lib/actions/common/filters";
import { type SessionSpansTraceResult } from "@/lib/actions/sessions/search-spans";
import { fetchApi } from "@/lib/api/fetch-api";
import { createLatestRequest } from "@/lib/api/latest-request";

import { type BaseSessionViewStore, createBaseSessionViewSlice, SessionViewContext } from "./base";

export { type SessionViewSelectedSpan, useSessionViewBaseStore } from "./base";

export type SessionSummary = {
  sessionId: string;
  // Optional aggregated stats (may be set from the table row when available).
  startTime?: string;
  endTime?: string;
  totalTokens?: number;
  totalCost?: number;
  traceCount?: number;
};

interface SessionViewStoreState {
  // Session metadata
  session?: SessionSummary;

  // Session timeline
  sessionTimelineEnabled: boolean;
  sessionTimelineZoom: number;
}

interface SessionViewStoreActions {
  setSession: (session?: SessionSummary) => void;
  setSessionTimelineEnabled: (enabled: boolean) => void;
  setSessionTimelineZoom: (zoom: number) => void;

  searchSessionSpans: (filters: Filter[], search: string) => Promise<void>;
  clearSearch: () => void;
}

export type SessionViewStore = BaseSessionViewStore & SessionViewStoreState & SessionViewStoreActions;

const createSessionViewStore = (options?: { initialSession?: SessionSummary; storeKey?: string }) => {
  const searchRequest = createLatestRequest();

  return createStore<SessionViewStore>()(
    persist(
      (set, get) => ({
        ...createBaseSessionViewSlice<SessionViewStore>(set, get, {}),

        session: options?.initialSession,
        sessionTimelineEnabled: false,
        sessionTimelineZoom: 1,

        setSession: (session) => set({ session }),
        setSessionTimelineEnabled: (enabled) => set({ sessionTimelineEnabled: enabled }),
        setSessionTimelineZoom: (zoom) => set({ sessionTimelineZoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)) }),

        searchSessionSpans: async (filters, search) => {
          const state = get();
          const { projectId, session } = state;
          if (!projectId || !session?.sessionId) return;

          set({ isSearchLoading: true, searchError: undefined });

          const params = new URLSearchParams();
          if (search) params.set("search", search);
          params.append("searchIn", "input");
          params.append("searchIn", "output");
          for (const f of filters) params.append("filter", JSON.stringify(f));

          const encodedSessionId = encodeURIComponent(session.sessionId);
          const url = `/api/projects/${projectId}/sessions/${encodedSessionId}/spans?${params.toString()}`;
          const response = await searchRequest.run((signal) =>
            fetchApi<{ traces: SessionSpansTraceResult[] }>(url, { signal })
          );
          if (response.superseded) return;

          const { data, error } = response.data;
          if (error !== null) {
            set({ searchError: error || "Search failed", isSearchLoading: false });
            return;
          }

          const results: Record<string, SessionSpansTraceResult> = {};
          for (const t of data.traces) results[t.traceId] = t;

          set({ searchResults: results, isSearchLoading: false });
        },

        clearSearch: () => {
          searchRequest.cancel();
          set({ searchResults: undefined, isSearchLoading: false, searchError: undefined });
        },
      }),
      {
        name: options?.storeKey ?? "session-view-state",
        partialize: (state) => ({
          sessionPanelWidth: state.sessionPanelWidth,
          spanPanelWidth: state.spanPanelWidth,
          sessionTimelineEnabled: state.sessionTimelineEnabled,
          sessionTimelineZoom: state.sessionTimelineZoom,
        }),
        merge: (persistedState, currentState) => {
          const persisted = (persistedState ?? {}) as Record<string, unknown>;
          return {
            ...currentState,
            ...(typeof persisted.sessionPanelWidth === "number" && { sessionPanelWidth: persisted.sessionPanelWidth }),
            ...(typeof persisted.spanPanelWidth === "number" && { spanPanelWidth: persisted.spanPanelWidth }),
            ...(typeof persisted.sessionTimelineEnabled === "boolean" && {
              sessionTimelineEnabled: persisted.sessionTimelineEnabled,
            }),
            ...(typeof persisted.sessionTimelineZoom === "number" && {
              sessionTimelineZoom: persisted.sessionTimelineZoom,
            }),
          };
        },
      }
    )
  );
};

const SessionViewStoreContext = createContext<StoreApi<SessionViewStore> | undefined>(undefined);

interface SessionViewStoreProviderProps {
  initialSession?: SessionSummary;
  storeKey?: string;
}

const SessionViewStoreProvider = ({
  children,
  initialSession,
  storeKey,
}: PropsWithChildren<SessionViewStoreProviderProps>) => {
  const [storeState] = useState(() => createSessionViewStore({ initialSession, storeKey }));

  // Provide both the base context (consumed by shared children via
  // useSessionViewBaseStore) and the concrete context (session-coupled fields).
  return (
    <SessionViewContext.Provider value={storeState}>
      <SessionViewStoreContext.Provider value={storeState}>{children}</SessionViewStoreContext.Provider>
    </SessionViewContext.Provider>
  );
};

export const useSessionViewStore = <T,>(
  selector: (store: SessionViewStore) => T,
  equalityFn?: (a: T, b: T) => boolean
): T => {
  const store = useContext(SessionViewStoreContext);
  if (!store) {
    throw new Error("useSessionViewStore must be used within a SessionViewStoreProvider");
  }
  return useStoreWithEqualityFn(store, selector, equalityFn);
};

export default SessionViewStoreProvider;
