import { isNil } from "lodash";
import { createContext, type PropsWithChildren, useContext, useRef } from "react";
import { createStore, type StoreApi, useStore } from "zustand";
import { persist } from "zustand/middleware";

import {
  type BaseTraceViewStore,
  createBaseTraceViewSlice,
  TraceViewContext,
  type TraceViewSpan,
  type TraceViewTrace,
} from "@/components/traces/trace-view/store/base";
import { type RolloutSessionStatus } from "@/lib/actions/rollout-sessions";
import { SpanType } from "@/lib/traces/types";
import { tryParseJson } from "@/lib/utils";

import { type SystemMessage } from "./system-messages-utils";

export const MIN_SIDEBAR_WIDTH = 450;

interface RolloutSessionStoreState {
  sidebarWidth: number;
  systemMessagesMap: Map<string, SystemMessage>;
  isSystemMessagesLoading: boolean;
  cachedSpanCounts: Record<string, number>;
  overrides: Record<string, { system: string }>;
  isRolloutLoading: boolean;
  rolloutError?: string;
  sessionStatus: RolloutSessionStatus;
  isSessionDeleted: boolean;
  params: Array<{ name: string; [key: string]: any }>;
  paramValues: string;
}

interface RolloutSessionStoreActions {
  setSidebarWidth: (width: number) => void;

  setSystemMessagesMap: (
    messages: Map<string, SystemMessage> | ((prev: Map<string, SystemMessage>) => Map<string, SystemMessage>)
  ) => void;
  setIsSystemMessagesLoading: (isLoading: boolean) => void;
  setCachedSpanCounts: (
    cachedSpanCounts: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)
  ) => void;
  isSpanCached: (span: TraceViewSpan) => boolean;
  cacheToSpan: (span: TraceViewSpan) => void;
  uncacheFromSpan: (span: TraceViewSpan) => void;
  toggleOverride: (messageId: string) => void;
  updateOverride: (pathKey: string, content: string) => void;
  isOverrideEnabled: (messageId: string) => boolean;
  resetOverride: (messageId: string) => void;
  getLlmPathCounts: () => Record<string, number>;
  setIsRolloutLoading: (isLoading: boolean) => void;
  setRolloutError: (error?: string) => void;
  setSessionStatus: (status: RolloutSessionStatus) => void;
  setIsSessionDeleted: (isSessionDeleted: boolean) => void;
  runRollout: (projectId: string, sessionId: string) => Promise<{ success: boolean; error?: string }>;
  cancelSession: (projectId: string, sessionId: string) => Promise<{ success: boolean; error?: string }>;
  setParamValue: (value: string) => void;
}

type RolloutSessionStore = BaseTraceViewStore & RolloutSessionStoreState & RolloutSessionStoreActions;

const createRolloutSessionStore = ({
  trace,
  params = [],
  storeKey = "rollout-session-state",
  initialStatus = "PENDING",
}: {
  trace?: TraceViewTrace;
  params?: Array<{ name: string; [key: string]: any }>;
  storeKey?: string;
  initialStatus?: RolloutSessionStatus;
}) =>
  createStore<RolloutSessionStore>()(
    persist(
      (set, get) => ({
        ...createBaseTraceViewSlice(set, get, { initialTrace: trace }),

        condensedTimelineEnabled: false,

        // Override selectSpanById: rollout doesn't expand collapsed ancestors
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

        // Override setSpans: also recalculate cachedSpanCounts
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

        cacheToSpan: (span: TraceViewSpan) => {
          const spans = get().spans;
          const clickedSpanTime = new Date(span.startTime).getTime();

          const spansBeforeOrAt = spans
            .filter((s) => s.spanType === SpanType.LLM || s.spanType === SpanType.CACHED)
            .filter((s) => new Date(s.startTime).getTime() <= clickedSpanTime)
            .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

          const newCachedCounts: Record<string, number> = {};

          spansBeforeOrAt.forEach((s) => {
            const sPath = s.attributes?.["lmnr.span.path"];
            if (sPath && Array.isArray(sPath)) {
              const pathKey = sPath.join(".");
              newCachedCounts[pathKey] = (newCachedCounts[pathKey] || 0) + 1;
            }
          });

          set({ cachedSpanCounts: newCachedCounts });
        },

        uncacheFromSpan: (span: TraceViewSpan) => {
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

          set({ cachedSpanCounts: newCachedCounts });
        },

        // Rollout-specific state
        sidebarWidth: MIN_SIDEBAR_WIDTH,
        systemMessagesMap: new Map(),
        isSystemMessagesLoading: false,
        cachedSpanCounts: {},
        overrides: {},
        isRolloutLoading: false,
        rolloutError: undefined,
        sessionStatus: initialStatus,
        isSessionDeleted: false,
        params,
        paramValues: "" as string,

        // Rollout-specific actions
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

        setCachedSpanCounts: (cachedSpanCounts) => {
          if (typeof cachedSpanCounts === "function") {
            const prevCachedSpanCounts = get().cachedSpanCounts;
            const newCachedSpanCounts = cachedSpanCounts(prevCachedSpanCounts);
            set({ cachedSpanCounts: newCachedSpanCounts });
          } else {
            set({ cachedSpanCounts });
          }
        },

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

        getLlmPathCounts: (): Record<string, number> => {
          const pathMap: Record<string, number> = {};

          get()
            .spans.filter((s) => s.spanType === SpanType.LLM || s.spanType === SpanType.CACHED)
            .forEach((span) => {
              const spanPath = span.attributes?.["lmnr.span.path"];
              if (spanPath && Array.isArray(spanPath)) {
                const pathKey = spanPath.join(".");
                pathMap[pathKey] = (pathMap[pathKey] || 0) + 1;
              }
            });

          return pathMap;
        },

        setIsRolloutLoading: (isRolloutLoading: boolean) => set({ isRolloutLoading }),
        setRolloutError: (rolloutError?: string) => set({ rolloutError }),
        setSessionStatus: (sessionStatus: RolloutSessionStatus) => set({ sessionStatus }),

        runRollout: async (projectId: string, sessionId: string) => {
          try {
            set({ isRolloutLoading: true, rolloutError: undefined });

            const overrides = get().overrides;
            const currentTraceId = get()?.trace?.id;
            const cachedSpanCounts = get().cachedSpanCounts;
            const paramValues = get().paramValues;

            const rolloutPayload: Record<string, any> = {};

            set({ spans: [], cachedSpanCounts: {}, trace: undefined });
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

            const response = await fetch(`/api/projects/${projectId}/rollout-sessions/${sessionId}/run`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(rolloutPayload),
            });

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
              throw new Error(errorData.error || "Failed to run rollout");
            }

            await response.json();
            set({ sessionStatus: "RUNNING" });

            return { success: true };
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Failed to run rollout";
            set({ rolloutError: errorMessage });
            return { success: false, error: errorMessage };
          } finally {
            set({ isRolloutLoading: false });
          }
        },
        setIsSessionDeleted: (isSessionDeleted: boolean) => set({ isSessionDeleted }),

        cancelSession: async (projectId: string, sessionId: string) => {
          try {
            set({ isRolloutLoading: true });

            const response = await fetch(`/api/projects/${projectId}/rollout-sessions/${sessionId}/status`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "STOPPED" }),
            });

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
              throw new Error(errorData.error || "Failed to cancel rollout");
            }

            set({ sessionStatus: "STOPPED" });
            return { success: true };
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Failed to cancel rollout";
            return { success: false, error: errorMessage };
          } finally {
            set({ isRolloutLoading: false });
          }
        },

        setParamValue: (value: string) => {
          set({ paramValues: value });
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
          };
        },
        merge: (persistedState, currentState) => {
          const persisted = persistedState as Partial<RolloutSessionStore>;
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

export const RolloutSessionStoreContext = createContext<StoreApi<RolloutSessionStore> | undefined>(undefined);

const RolloutSessionStoreProvider = ({
  trace,
  params,
  storeKey,
  initialStatus,
  children,
}: PropsWithChildren<{
  trace?: TraceViewTrace;
  params?: Array<{ name: string; [key: string]: any }>;
  storeKey?: string;
  initialStatus?: RolloutSessionStatus;
}>) => {
  const storeRef = useRef<StoreApi<RolloutSessionStore>>(undefined);

  if (!storeRef.current) {
    storeRef.current = createRolloutSessionStore({ trace, params, storeKey, initialStatus });
  }

  return (
    <TraceViewContext.Provider value={storeRef.current}>
      <RolloutSessionStoreContext.Provider value={storeRef.current}>{children}</RolloutSessionStoreContext.Provider>
    </TraceViewContext.Provider>
  );
};

export const useRolloutSessionStoreContext = <T,>(selector: (store: RolloutSessionStore) => T): T => {
  const store = useContext(RolloutSessionStoreContext);
  if (!store) {
    throw new Error("useRolloutSessionStoreContext must be used within a RolloutSessionStoreContext");
  }

  return useStore(store, selector);
};

export const useRolloutSessionStore = () => {
  const store = useContext(RolloutSessionStoreContext);
  if (!store) {
    throw new Error("useRolloutSessionStore must be used within a RolloutSessionStoreContext");
  }
  return store;
};

const NOOP_ROLLOUT_SESSION_STORE = createStore(() => ({})) as unknown as StoreApi<RolloutSessionStore>;

export const useRolloutCaching = <T,>(selector: (state: RolloutSessionStore) => T): { enabled: boolean; state: T } => {
  const store = useContext(RolloutSessionStoreContext);
  const state = useStore(store ?? NOOP_ROLLOUT_SESSION_STORE, selector);
  return { enabled: !isNil(store), state };
};

export default RolloutSessionStoreProvider;
