import { isNil } from "lodash";
import { createContext, type PropsWithChildren, useContext, useState } from "react";
import { createStore, type StoreApi, useStore } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import {
  type BaseTraceViewStore,
  createBaseTraceViewSlice,
  TraceViewContext,
  type TraceViewSpan,
  type TraceViewTrace,
} from "@/components/traces/trace-view/store/base.ts";
import { enrichSpansWithPending } from "@/components/traces/trace-view/utils.ts";
import { type DebuggerSessionStatus } from "@/lib/actions/debugger-sessions";
import { SpanType, type TraceRow } from "@/lib/traces/types.ts";

export const MIN_SIDEBAR_WIDTH = 360;

interface DebuggerSessionStoreState {
  sidebarWidth: number;
  sessionStatus: DebuggerSessionStatus;
  isSessionDeleted: boolean;
  historyRuns: TraceRow[];
  isHistoryLoading: boolean;
}

interface DebuggerSessionStoreActions {
  setSidebarWidth: (width: number) => void;
  isSpanCached: (span: TraceViewSpan) => boolean;
  setSessionStatus: (status: DebuggerSessionStatus) => void;
  setIsSessionDeleted: (isSessionDeleted: boolean) => void;
  loadHistoryTrace: (projectId: string, traceId: string, startTime: string, endTime: string) => Promise<void>;
  setHistoryRuns: (runs: TraceRow[]) => void;
  setIsHistoryLoading: (loading: boolean) => void;
}

type DebuggerSessionStore = BaseTraceViewStore & DebuggerSessionStoreState & DebuggerSessionStoreActions;

const createDebuggerSessionStore = ({
  trace,
  storeKey = "debugger-session-state",
  initialStatus = "PENDING",
}: {
  trace?: TraceViewTrace;
  storeKey?: string;
  initialStatus?: DebuggerSessionStatus;
}) => {
  let loadTraceController: AbortController | null = null;

  return createStore<DebuggerSessionStore>()(
    persist(
      (set, get) => ({
        ...createBaseTraceViewSlice(set, get, { initialTrace: trace }),
        // Override selectSpanById: debugger view doesn't expand collapsed ancestors
        selectSpanById: (spanId: string) => {
          const span = get().spans.find((s) => s.spanId === spanId);
          if (span && !span.pending) {
            set({ selectedSpan: span });
          }
        },

        setSpans: (spans) => {
          let newSpans: TraceViewSpan[];

          if (typeof spans === "function") {
            const prevSpans = get().spans;
            newSpans = spans(prevSpans);
          } else {
            newSpans = spans.map((s) => ({ ...s, collapsed: false }));
          }

          set({ spans: newSpans });
        },

        setTrace: (trace) => {
          let newTrace: TraceViewTrace | undefined;
          if (typeof trace === "function") {
            const prevTrace = get().trace;
            newTrace = trace(prevTrace);
          } else {
            newTrace = trace;
          }
          set({ trace: newTrace });

          if (newTrace) {
            const historyRuns = get().historyRuns;
            const existingIndex = historyRuns.findIndex((r) => r.id === newTrace.id);

            const traceFields: Partial<TraceRow> = {
              startTime: newTrace.startTime,
              endTime: newTrace.endTime,
              status: newTrace.status,
              inputTokens: newTrace.inputTokens,
              outputTokens: newTrace.outputTokens,
              totalTokens: newTrace.totalTokens,
              inputCost: newTrace.inputCost,
              outputCost: newTrace.outputCost,
              totalCost: newTrace.totalCost,
            };

            if (existingIndex === -1) {
              set({
                historyRuns: [
                  {
                    id: newTrace.id,
                    traceType: newTrace.traceType as TraceRow["traceType"],
                    metadata: {},
                    tags: [],
                    ...traceFields,
                  } as TraceRow,
                  ...historyRuns,
                ],
              });
            } else {
              const existing = historyRuns[existingIndex];
              const existingEndMs = new Date(existing.endTime).getTime();
              const newEndMs = new Date(newTrace.endTime).getTime();
              // Guard against empty/invalid endTime (in-progress runs yield NaN);
              // a NaN comparison would otherwise silently discard a valid update.
              const newEndTime =
                !Number.isNaN(newEndMs) && (Number.isNaN(existingEndMs) || newEndMs > existingEndMs)
                  ? newTrace.endTime
                  : existing.endTime;

              if (newEndTime !== existing.endTime || newTrace.status !== existing.status) {
                const updated = [...historyRuns];
                updated[existingIndex] = { ...existing, ...traceFields, endTime: newEndTime };
                set({ historyRuns: updated });
              }
            }
          }
        },

        // Read-only replay indication: a span was replayed iff the SDK tagged it CACHED.
        // The frontend never derives the spine boundary itself (see shared spec §9).
        isSpanCached: (span: TraceViewSpan): boolean => span.spanType === SpanType.CACHED,

        sidebarWidth: MIN_SIDEBAR_WIDTH,
        sessionStatus: initialStatus,
        isSessionDeleted: false,
        historyRuns: [],
        isHistoryLoading: false,

        setSidebarWidth: (sidebarWidth) => set({ sidebarWidth }),

        setSessionStatus: (sessionStatus: DebuggerSessionStatus) => set({ sessionStatus }),

        setIsSessionDeleted: (isSessionDeleted: boolean) => set({ isSessionDeleted }),

        setHistoryRuns: (runs: TraceRow[]) => set({ historyRuns: runs }),
        setIsHistoryLoading: (isHistoryLoading: boolean) => set({ isHistoryLoading }),

        loadHistoryTrace: async (projectId: string, traceId: string, startTime: string, endTime: string) => {
          loadTraceController?.abort();
          const controller = new AbortController();
          loadTraceController = controller;
          const { signal } = controller;

          set({
            trace: {
              id: traceId,
              startTime,
              endTime,
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              inputCost: 0,
              outputCost: 0,
              totalCost: 0,
              metadata: "{}",
              status: "",
              traceType: "",
              visibility: "private" as const,
              hasBrowserSession: false,
            },
            spans: [],
            selectedSpan: undefined,
            traceError: undefined,
            spansError: undefined,
            isTraceLoading: true,
            isSpansLoading: true,
          });

          try {
            const spanParams = new URLSearchParams();
            spanParams.append("searchIn", "input");
            spanParams.append("searchIn", "output");
            spanParams.set("startDate", new Date(new Date(startTime).getTime() - 1000).toISOString());
            spanParams.set("endDate", new Date(new Date(endTime).getTime() + 1000).toISOString());

            const [traceResult, spansResult] = await Promise.allSettled([
              fetch(`/api/projects/${projectId}/traces/${traceId}`, { signal }).then((r) =>
                r.ok ? (r.json() as Promise<TraceViewTrace>) : null
              ),
              fetch(`/api/projects/${projectId}/traces/${traceId}/spans?${spanParams.toString()}`, { signal }).then(
                (r) => (r.ok ? (r.json() as Promise<TraceViewSpan[]>) : null)
              ),
            ]);

            if (signal.aborted) return;

            if (traceResult.status === "fulfilled" && traceResult.value) {
              get().setTrace(traceResult.value);
            } else if (traceResult.status === "rejected") {
              set({ traceError: "Failed to load trace" });
            }

            if (spansResult.status === "fulfilled" && spansResult.value) {
              get().setSpans(enrichSpansWithPending(spansResult.value));
            } else if (spansResult.status === "rejected") {
              set({ spansError: "Failed to load spans" });
            }
          } catch {
            if (signal.aborted) return;
            set({ traceError: "Failed to load trace", spansError: "Failed to load spans" });
          } finally {
            if (!signal.aborted) set({ isTraceLoading: false, isSpansLoading: false });
          }
        },
      }),
      {
        name: storeKey,
        partialize: (state) => {
          const persistentTabs = ["tree", "transcript"] as const;
          const tabToPersist = persistentTabs.includes(state.tab as any) ? state.tab : undefined;

          return {
            sidebarWidth: state.sidebarWidth,
            ...(tabToPersist && { tab: tabToPersist }),
            showTreeContent: state.showTreeContent,
            condensedTimelineEnabled: state.condensedTimelineEnabled,
          };
        },
        merge: (persistedState, currentState) => {
          const persisted = persistedState as Partial<DebuggerSessionStore>;
          const validTabs = ["tree", "transcript"] as const;
          const tab = persisted.tab && validTabs.includes(persisted.tab as any) ? persisted.tab : "transcript";

          return {
            ...currentState,
            ...persisted,
            tab,
          };
        },
      }
    )
  );
};

export const DebuggerSessionStoreContext = createContext<StoreApi<DebuggerSessionStore> | undefined>(undefined);

const DebuggerSessionStoreProvider = ({
  trace,
  storeKey,
  initialStatus,
  children,
}: PropsWithChildren<{
  trace?: TraceViewTrace;
  storeKey?: string;
  initialStatus?: DebuggerSessionStatus;
}>) => {
  const [storeState] = useState(() => createDebuggerSessionStore({ trace, storeKey, initialStatus }));

  return (
    <TraceViewContext.Provider value={storeState}>
      <DebuggerSessionStoreContext.Provider value={storeState}>{children}</DebuggerSessionStoreContext.Provider>
    </TraceViewContext.Provider>
  );
};

export const useDebuggerSessionStore = <T,>(selector: (store: DebuggerSessionStore) => T): T => {
  const store = useContext(DebuggerSessionStoreContext);
  if (!store) {
    throw new Error("useDebuggerSessionStoreContext must be used within a DebuggerSessionStoreContext");
  }

  return useStore(store, useShallow(selector));
};

const NOOP_DEBUGGER_SESSION_STORE = createStore(() => ({})) as unknown as StoreApi<DebuggerSessionStore>;

export const useOptionalDebuggerStore = <T,>(
  selector: (state: DebuggerSessionStore) => T
): { enabled: boolean; state: T } => {
  const store = useContext(DebuggerSessionStoreContext);
  const state = useStore(store ?? NOOP_DEBUGGER_SESSION_STORE, selector);
  return { enabled: !isNil(store), state };
};

export default DebuggerSessionStoreProvider;
