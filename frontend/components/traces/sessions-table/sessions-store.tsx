"use client";

import { createContext, type PropsWithChildren, useContext, useState } from "react";
import { createStore } from "zustand";
import { useStoreWithEqualityFn } from "zustand/traditional";

import { type TraceRow } from "@/lib/traces/types";

export type SessionsState = {
  expandedSessions: Set<string>;
  loadingSessions: Set<string>;
  sessionTraces: Record<string, TraceRow[]>;
  traceIO: Record<string, { input: string | null; output: string | null }>;
  loadingSessionIO: Set<string>;
};

export type SessionsActions = {
  expandSession: (sessionId: string) => void;
  collapseSession: (sessionId: string) => void;
  setLoadingSession: (sessionId: string, loading: boolean) => void;
  setSessionTraces: (sessionId: string, traces: TraceRow[]) => void;
  mergeTraceIO: (io: Record<string, { input: string | null; output: string | null }>) => void;
  setLoadingSessionIO: (sessionId: string, loading: boolean) => void;
  resetExpandState: () => void;
  getController: (sessionId: string) => AbortController;
};

export type SessionsStore = SessionsState & SessionsActions;

export type SessionsStoreApi = ReturnType<typeof createSessionsStore>;

const DEFAULT_STATE: SessionsState = {
  expandedSessions: new Set(),
  loadingSessions: new Set(),
  sessionTraces: {},
  traceIO: {},
  loadingSessionIO: new Set(),
};

export const createSessionsStore = () => {
  const sessionControllers = new Map<string, AbortController>();

  return createStore<SessionsStore>()((set) => ({
    ...DEFAULT_STATE,

    expandSession: (sessionId) =>
      set((state) => {
        const next = new Set(state.expandedSessions);
        next.add(sessionId);
        return { expandedSessions: next };
      }),

    collapseSession: (sessionId) => {
      sessionControllers.get(sessionId)?.abort();
      sessionControllers.delete(sessionId);
      set((state) => {
        const nextExpanded = new Set(state.expandedSessions);
        nextExpanded.delete(sessionId);
        const nextLoading = new Set(state.loadingSessions);
        nextLoading.delete(sessionId);
        return { expandedSessions: nextExpanded, loadingSessions: nextLoading };
      });
    },

    setLoadingSession: (sessionId, loading) =>
      set((state) => {
        const next = new Set(state.loadingSessions);
        if (loading) {
          next.add(sessionId);
        } else {
          next.delete(sessionId);
        }
        return { loadingSessions: next };
      }),

    setSessionTraces: (sessionId, traces) =>
      set((state) => ({
        sessionTraces: { ...state.sessionTraces, [sessionId]: traces },
      })),

    mergeTraceIO: (io) =>
      set((state) => ({
        traceIO: { ...state.traceIO, ...io },
      })),

    setLoadingSessionIO: (sessionId, loading) =>
      set((state) => {
        const next = new Set(state.loadingSessionIO);
        if (loading) next.add(sessionId);
        else next.delete(sessionId);
        return { loadingSessionIO: next };
      }),

    resetExpandState: () => {
      for (const c of sessionControllers.values()) c.abort();
      sessionControllers.clear();
      set({
        expandedSessions: new Set(),
        loadingSessions: new Set(),
        sessionTraces: {},
        traceIO: {},
        loadingSessionIO: new Set(),
      });
    },

    getController: (sessionId) => {
      sessionControllers.get(sessionId)?.abort();
      const controller = new AbortController();
      sessionControllers.set(sessionId, controller);
      return controller;
    },
  }));
};

export const SessionsContext = createContext<SessionsStoreApi | null>(null);

export const useSessionsStoreContext = <T,>(
  selector: (state: SessionsStore) => T,
  equalityFn?: (a: T, b: T) => boolean
): T => {
  const store = useContext(SessionsContext);
  if (!store) throw new Error("Missing SessionsContext.Provider in the tree");
  return useStoreWithEqualityFn(store, selector, equalityFn);
};

export const SessionsStoreProvider = ({ children }: PropsWithChildren) => {
  const [storeState] = useState(() => createSessionsStore());

  return <SessionsContext.Provider value={storeState}>{children}</SessionsContext.Provider>;
};
