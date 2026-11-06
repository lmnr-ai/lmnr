"use client";

import { useParams } from "next/navigation";
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";
import { useSWRConfig } from "swr";
import { type StoreApi } from "zustand";
import { useStoreWithEqualityFn } from "zustand/traditional";

import { useSessionViewStore } from "@/components/traces/session-view/store";
import { type TraceSpanCounts } from "@/lib/actions/traces/span-counts";
import { fetchApi } from "@/lib/api/fetch-api";
import { useRealtime } from "@/lib/hooks/use-realtime";
import { type RealtimeAgentInputPayload, type RealtimeTracePayload } from "@/lib/traces/types";

import { fetchSessionTraces, sessionModelTokensUrl } from "../session-api";
import { createLiveSessionStore, type LiveSessionState } from "./store";

const LiveSessionContext = createContext<StoreApi<LiveSessionState> | null>(null);

const postIds = <T,>(url: string, traceIds: string[]) =>
  fetchApi<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ traceIds }),
  }).then(({ data }) => data ?? undefined);

const parse = <T,>(event: MessageEvent): T | undefined => {
  try {
    return JSON.parse(event.data) as T;
  } catch {
    return undefined;
  }
};

/**
 * Owns a session's live state: the trace snapshot, realtime deltas on the `session_<id>` channel, the refresh after
 * updates settle, and each turn's reply and span counts. Its traces are mirrored into the session-view store, which
 * the session timeline reads.
 */
export function LiveSessionProvider({ sessionId, children }: PropsWithChildren<{ sessionId: string }>) {
  const { projectId } = useParams<{ projectId: string }>();
  const { mutate } = useSWRConfig();
  const [store] = useState(() =>
    createLiveSessionStore({
      loadTraces: async () => {
        const { traces, error } = await fetchSessionTraces(projectId, sessionId);
        return traces ? { traces } : { error: error ?? "Failed to load the session." };
      },
      loadReplies: (ids) => postIds<Record<string, string | null>>(`/api/projects/${projectId}/traces/output`, ids),
      loadCounts: (ids) =>
        postIds<Record<string, TraceSpanCounts>>(`/api/projects/${projectId}/traces/span-counts`, ids),
      onRefreshed: () => void mutate(sessionModelTokensUrl(projectId, sessionId)),
    })
  );

  useEffect(() => {
    store.getState().start();
    return () => store.getState().dispose();
  }, [store]);

  useMirrorToSessionView(store, projectId);

  const eventHandlers = useMemo(
    () => ({
      trace_update: (event: MessageEvent) => {
        const traces = parse<{ traces?: RealtimeTracePayload[] }>(event)?.traces ?? [];
        if (traces.length > 0) store.getState().receive({ type: "delta", traces });
      },
      trace_agent_input_update: (event: MessageEvent) => {
        const payload = parse<RealtimeAgentInputPayload>(event);
        if (payload?.traceId) {
          store.getState().receive({ type: "agentInput", traceId: payload.traceId, agentInput: payload.agentInput });
        }
      },
    }),
    [store]
  );
  useRealtime({ key: `session_${sessionId}`, projectId, eventHandlers, enabled: !!projectId });

  return <LiveSessionContext.Provider value={store}>{children}</LiveSessionContext.Provider>;
}

/** The session-view store is the timeline's source; this module is the only writer of its traces. */
function useMirrorToSessionView(store: StoreApi<LiveSessionState>, projectId: string) {
  const setProjectId = useSessionViewStore((s) => s.setProjectId);
  const setTraces = useSessionViewStore((s) => s.setTraces);
  const setIsTracesLoading = useSessionViewStore((s) => s.setIsTracesLoading);

  useEffect(() => setProjectId(projectId), [projectId, setProjectId]);

  useEffect(() => {
    const mirror = ({ sync }: LiveSessionState) => {
      setTraces(sync.traces);
      setIsTracesLoading(sync.status === "loading");
    };
    mirror(store.getState());
    return store.subscribe((state, prev) => {
      if (state.sync.traces !== prev.sync.traces || state.sync.status !== prev.sync.status) mirror(state);
    });
  }, [store, setTraces, setIsTracesLoading]);
}

export function useLiveSession<T>(selector: (state: LiveSessionState) => T, equalityFn?: (a: T, b: T) => boolean): T {
  return useStoreWithEqualityFn(useLiveSessionStore(), selector, equalityFn);
}

/** The store itself, for reading the latest state inside effects without subscribing to it. */
export function useLiveSessionStore(): StoreApi<LiveSessionState> {
  const store = useContext(LiveSessionContext);
  if (!store) throw new Error("useLiveSession must be used within LiveSessionProvider");
  return store;
}
