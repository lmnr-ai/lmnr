import { isNil } from "lodash";
import { createContext, type PropsWithChildren, useContext, useRef } from "react";
import { createStore, type StoreApi, useStore } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import { deriveCheckpointSpanId } from "@/components/debugger-sessions/debugger-session-view/store/utils.ts";
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
import { tryParseJson } from "@/lib/utils.ts";

import { type SystemMessage } from "../system-messages-utils.ts";

export const MIN_SIDEBAR_WIDTH = 450;

interface DebuggerSessionStoreState {
  sidebarWidth: number;
  systemMessagesMap: Map<string, SystemMessage>;
  isSystemMessagesLoading: boolean;
  cachedSpanCounts: Record<string, number>;
  checkpointSpanId: string | undefined;
  overrides: Record<string, { system: string }>;
  generatedNames: Record<string, string>;
  isLoading: boolean;
  error?: string;
  sessionStatus: DebuggerSessionStatus;
  isSessionDeleted: boolean;
  params: Array<{ name: string; [key: string]: any }>;
  paramValues: string;
  historyRuns: TraceRow[];
  isHistoryLoading: boolean;
}

interface DebuggerSessionStoreActions {
  setSidebarWidth: (width: number) => void;

  setSystemMessagesMap: (
    messages: Map<string, SystemMessage> | ((prev: Map<string, SystemMessage>) => Map<string, SystemMessage>)
  ) => void;
  setIsSystemMessagesLoading: (isLoading: boolean) => void;
  isSpanCached: (span: TraceViewSpan) => boolean;
  isCheckpointSpan: (span: TraceViewSpan) => boolean;
  setCheckpoint: (span: TraceViewSpan) => void;
  clearCheckpoint: () => void;
  toggleOverride: (messageId: string) => void;
  updateOverride: (pathKey: string, content: string) => void;
  isOverrideEnabled: (messageId: string) => boolean;
  resetOverride: (messageId: string) => void;
  setSessionStatus: (status: DebuggerSessionStatus) => void;
  setIsSessionDeleted: (isSessionDeleted: boolean) => void;
  runDebugger: (projectId: string, sessionId: string) => Promise<{ success: boolean; error?: string }>;
  cancelSession: (projectId: string, sessionId: string) => Promise<{ success: boolean; error?: string }>;
  setParamValue: (value: string) => void;
  loadHistoryTrace: (projectId: string, traceId: string, startTime: string, endTime: string) => Promise<void>;
  setHistoryRuns: (runs: TraceRow[]) => void;
  setIsHistoryLoading: (loading: boolean) => void;
  setGeneratedName: (pathKey: string, name: string) => void;
}

type DebuggerSessionStore = BaseTraceViewStore & DebuggerSessionStoreState & DebuggerSessionStoreActions;

const createDebuggerSessionStore = ({
  trace,
  params = [],
  storeKey = "debugger-session-state",
  initialStatus = "PENDING",
}: {
  trace?: TraceViewTrace;
  params?: Array<{ name: string; [key: string]: any }>;
  storeKey?: string;
  initialStatus?: DebuggerSessionStatus;
}) =>
  createStore<DebuggerSessionStore>()(
    persist(
      (set, get) => ({
        ...createBaseTraceViewSlice(set, get, { initialTrace: trace }),

        condensedTimelineEnabled: false,

        selectSpanById: (spanId: string) => {
          const span = get().spans.find((s) => s.spanId === spanId);
          if (span && !span.pending) {
            set({ selectedSpan: span });
            const spanPath = span.attributes?.["lmnr.span.path"];
            if (spanPath && Array.isArray(spanPath)) {
              set({ spanPath });
            }
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

          const cachedSpans = newSpans.filter((s) => s.spanType === SpanType.CACHED);
          if (cachedSpans.length > 0) {
            const newCachedCounts: Record<string, number> = {};
            cachedSpans.forEach((s) => {
              const sPath = s.attributes?.["lmnr.span.path"];
              if (sPath && Array.isArray(sPath)) {
                const pathKey = sPath.join(".");
                newCachedCounts[pathKey] = (newCachedCounts[pathKey] || 0) + 1;
              }
            });
            set({ cachedSpanCounts: newCachedCounts });
          }

          set({ checkpointSpanId: deriveCheckpointSpanId(newSpans, get().cachedSpanCounts) });
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
              const newEndTime =
                new Date(newTrace.endTime).getTime() > new Date(existing.endTime).getTime()
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
        isSpanCached: (span: TraceViewSpan): boolean => {
          const spanPath = span.attributes?.["lmnr.span.path"];
          if (!spanPath || !Array.isArray(spanPath)) return false;

          const spanPathKey = spanPath.join(".");
          const cacheCount = get().cachedSpanCounts[spanPathKey];

          if (!cacheCount) return false;

          const spans = get().spans;
          const spansWithSamePath = spans
            .filter((s) => s.spanType === SpanType.LLM || s.spanType === SpanType.CACHED)
            .filter((s) => {
              const sPath = s.attributes?.["lmnr.span.path"];
              return sPath && Array.isArray(sPath) && sPath.join(".") === spanPathKey;
            })
            .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

          const spanIndex = spansWithSamePath.findIndex((s) => s.spanId === span.spanId);

          return spanIndex !== -1 && spanIndex < cacheCount;
        },

        isCheckpointSpan: (span: TraceViewSpan): boolean => span.spanId === get().checkpointSpanId,

        setCheckpoint: (span: TraceViewSpan) => {
          const spans = get().spans;
          const clickedSpanTime = new Date(span.startTime).getTime();

          const spansBefore = spans
            .filter((s) => s.spanType === SpanType.LLM || s.spanType === SpanType.CACHED)
            .filter((s) => new Date(s.startTime).getTime() < clickedSpanTime)
            .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

          const newCachedCounts: Record<string, number> = {};

          spansBefore.forEach((s) => {
            const sPath = s.attributes?.["lmnr.span.path"];
            if (sPath && Array.isArray(sPath)) {
              const pathKey = sPath.join(".");
              newCachedCounts[pathKey] = (newCachedCounts[pathKey] || 0) + 1;
            }
          });

          set({ cachedSpanCounts: newCachedCounts, checkpointSpanId: span.spanId });
        },

        clearCheckpoint: () => {
          set({ cachedSpanCounts: {}, checkpointSpanId: undefined });
        },

        sidebarWidth: MIN_SIDEBAR_WIDTH,
        systemMessagesMap: new Map(),
        isSystemMessagesLoading: false,
        cachedSpanCounts: {},
        checkpointSpanId: undefined,
        overrides: {},
        generatedNames: {},
        isLoading: false,
        error: undefined,
        sessionStatus: initialStatus,
        isSessionDeleted: false,
        params,
        paramValues: "" as string,
        historyRuns: [],
        isHistoryLoading: false,

        setSidebarWidth: (sidebarWidth) => set({ sidebarWidth }),

        setSystemMessagesMap: (messages) => {
          if (typeof messages === "function") {
            const prevMessages = get().systemMessagesMap;
            const newMessages = messages(prevMessages);
            set({ systemMessagesMap: newMessages });
          } else {
            set({ systemMessagesMap: messages });
          }
        },

        setIsSystemMessagesLoading: (isLoading) => set({ isSystemMessagesLoading: isLoading }),

        toggleOverride: (messageId: string) => {
          const message = get().systemMessagesMap.get(messageId);
          if (!message) return;

          const overrides = { ...get().overrides };

          if (overrides[message.pathKey]) {
            delete overrides[message.pathKey];
          } else {
            overrides[message.pathKey] = { system: message.content };
          }

          set({ overrides });
        },

        updateOverride: (pathKey: string, content: string) => {
          const overrides = { ...get().overrides };
          overrides[pathKey] = { system: content };
          set({ overrides });
        },

        isOverrideEnabled: (messageId: string): boolean => {
          const message = get().systemMessagesMap.get(messageId);
          if (!message) return false;
          return message.pathKey in get().overrides;
        },

        resetOverride: (messageId: string) => {
          const message = get().systemMessagesMap.get(messageId);
          if (!message) return;

          const overrides = { ...get().overrides };
          if (overrides[message.pathKey]) {
            overrides[message.pathKey] = { system: message.content };
            set({ overrides });
          }
        },

        setSessionStatus: (sessionStatus: DebuggerSessionStatus) => set({ sessionStatus }),

        runDebugger: async (projectId: string, sessionId: string) => {
          try {
            set({ isLoading: true, error: undefined });

            const overrides = get().overrides;
            const currentTraceId = get()?.trace?.id;
            const cachedSpanCounts = get().cachedSpanCounts;
            const paramValues = get().paramValues;

            const rolloutPayload: Record<string, any> = {};

            set({ spans: [], cachedSpanCounts: {}, checkpointSpanId: undefined, trace: undefined });
            if (currentTraceId) {
              rolloutPayload.trace_id = currentTraceId;
            }

            if (Object.keys(cachedSpanCounts).length > 0) {
              rolloutPayload.path_to_count = cachedSpanCounts;
            }

            if (paramValues && paramValues.trim() !== "") {
              rolloutPayload.args = tryParseJson(paramValues);
            }

            if (Object.keys(overrides).length > 0) {
              rolloutPayload.overrides = overrides;
            }

            const response = await fetch(`/api/projects/${projectId}/debugger-sessions/${sessionId}/run`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(rolloutPayload),
            });

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
              throw new Error(errorData.error || "Failed to run debugger");
            }

            await response.json();
            set({ sessionStatus: "RUNNING" });

            return { success: true };
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Failed to run debugger";
            set({ error: errorMessage });
            return { success: false, error: errorMessage };
          } finally {
            set({ isLoading: false });
          }
        },
        setIsSessionDeleted: (isSessionDeleted: boolean) => set({ isSessionDeleted }),

        cancelSession: async (projectId: string, sessionId: string) => {
          try {
            set({ isLoading: true });

            const response = await fetch(`/api/projects/${projectId}/debugger-sessions/${sessionId}/status`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "STOPPED" }),
            });

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
              throw new Error(errorData.error || "Failed to cancel debugger");
            }

            set({ sessionStatus: "STOPPED" });
            return { success: true };
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Failed to cancel debugger";
            return { success: false, error: errorMessage };
          } finally {
            set({ isLoading: false });
          }
        },

        setParamValue: (value: string) => {
          set({ paramValues: value });
        },

        setHistoryRuns: (runs: TraceRow[]) => set({ historyRuns: runs }),
        setIsHistoryLoading: (isHistoryLoading: boolean) => set({ isHistoryLoading }),

        setGeneratedName: (pathKey: string, name: string) =>
          set({ generatedNames: { ...get().generatedNames, [pathKey]: name } }),

        loadHistoryTrace: async (projectId: string, traceId: string, startTime: string, endTime: string) => {
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
            cachedSpanCounts: {},
            checkpointSpanId: undefined,
            systemMessagesMap: new Map(),
          });

          try {
            const traceResponse = await fetch(`/api/projects/${projectId}/traces/${traceId}`);
            if (traceResponse.ok) {
              const traceData = (await traceResponse.json()) as TraceViewTrace;
              get().setTrace(traceData);
            }
          } catch {
            set({ traceError: "Failed to load trace" });
          } finally {
            set({ isTraceLoading: false });
          }

          try {
            const spanParams = new URLSearchParams();
            spanParams.append("searchIn", "input");
            spanParams.append("searchIn", "output");
            spanParams.set("startDate", new Date(new Date(startTime).getTime() - 1000).toISOString());
            spanParams.set("endDate", new Date(new Date(endTime).getTime() + 1000).toISOString());

            const spansResponse = await fetch(
              `/api/projects/${projectId}/traces/${traceId}/spans?${spanParams.toString()}`
            );
            if (spansResponse.ok) {
              const results = (await spansResponse.json()) as TraceViewSpan[];
              get().setSpans(enrichSpansWithPending(results));
            }
          } catch {
            set({ spansError: "Failed to load spans" });
          } finally {
            set({ isSpansLoading: false });
          }
        },
      }),
      {
        name: storeKey,
        partialize: (state) => {
          const persistentTabs = ["tree", "reader"] as const;
          const tabToPersist = persistentTabs.includes(state.tab as any) ? state.tab : undefined;

          return {
            sidebarWidth: state.sidebarWidth,
            spanPath: state.spanPath,
            spanTemplates: state.spanTemplates,
            ...(tabToPersist && { tab: tabToPersist }),
            showTreeContent: state.showTreeContent,
            condensedTimelineEnabled: state.condensedTimelineEnabled,
            generatedNames: state.generatedNames,
          };
        },
        merge: (persistedState, currentState) => {
          const persisted = persistedState as Partial<DebuggerSessionStore>;
          const validTabs = ["tree", "reader"] as const;
          const tab = persisted.tab && validTabs.includes(persisted.tab as any) ? persisted.tab : currentState.tab;

          return {
            ...currentState,
            ...persisted,
            tab,
          };
        },
      }
    )
  );

export const DebuggerSessionStoreContext = createContext<StoreApi<DebuggerSessionStore> | undefined>(undefined);

const DebuggerSessionStoreProvider = ({
  trace,
  params,
  storeKey,
  initialStatus,
  children,
}: PropsWithChildren<{
  trace?: TraceViewTrace;
  params?: Array<{ name: string; [key: string]: any }>;
  storeKey?: string;
  initialStatus?: DebuggerSessionStatus;
}>) => {
  const storeRef = useRef<StoreApi<DebuggerSessionStore>>(undefined);

  if (!storeRef.current) {
    storeRef.current = createDebuggerSessionStore({ trace, params, storeKey, initialStatus });
  }

  return (
    <TraceViewContext.Provider value={storeRef.current}>
      <DebuggerSessionStoreContext.Provider value={storeRef.current}>{children}</DebuggerSessionStoreContext.Provider>
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
