"use client";

import { useParams } from "next/navigation";
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";

import { type TraceSpanCounts } from "@/lib/actions/traces/span-counts";
import { fetchApi } from "@/lib/api/fetch-api";
import { useRealtime } from "@/lib/hooks/use-realtime";
import { type RealtimeAgentInputPayload, type RealtimeTracePayload, type TraceRow } from "@/lib/traces/types";

import { fetchSessionTraces, sessionModelTokensUrl } from "../session-api";
import { createIdBatcher } from "./id-batcher";
import { applyAgentInput, applyTraceDeltas } from "./live-traces";

// Refresh from the server once live updates pause this long; ClickHouse lags the realtime stream.
const SETTLE_MS = 2000;

interface SessionData {
  traces: TraceRow[];
  /** Turns with live updates no server fetch reflects yet. */
  live: ReadonlySet<string>;
  isLoading: boolean;
  error?: string;
  loadReply: (traceId: string) => Promise<string | null | undefined>;
  loadCounts: (traceId: string) => Promise<TraceSpanCounts | undefined>;
}

const SessionDataContext = createContext<SessionData | null>(null);
const NO_TRACES: TraceRow[] = [];
const NOT_LIVE: ReadonlySet<string> = new Set();

const postIds = async <T,>(url: string, traceIds: string[]): Promise<T> => {
  const { data, error } = await fetchApi<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ traceIds }),
  });
  if (error !== null) throw new Error(error);
  return data;
};

const parse = <T,>(event: MessageEvent): T | undefined => {
  try {
    return JSON.parse(event.data) as T;
  } catch {
    return undefined;
  }
};

/**
 * The session's traces from SWR, patched by `session_<id>` realtime deltas and refreshed once they settle.
 * SWR drops a refresh that overlaps a patch, so a refresh that succeeds reflects every update so far.
 */
export function SessionDataProvider({ sessionId, children }: PropsWithChildren<{ sessionId: string }>) {
  const { projectId } = useParams<{ projectId: string }>();
  const { mutate: mutateKey } = useSWRConfig();
  const [live, setLive] = useState(NOT_LIVE);
  const hadLive = useRef(false);

  const { data, error, isLoading, mutate } = useSWR(
    projectId ? ["chat-session-traces", projectId, sessionId] : null,
    async () => {
      const { traces, error } = await fetchSessionTraces(projectId, sessionId);
      if (!traces) throw new Error(error ?? "Failed to load the session.");
      return traces;
    },
    {
      revalidateOnFocus: false,
      onSuccess: () => {
        setLive(NOT_LIVE);
        if (hadLive.current) void mutateKey(sessionModelTokensUrl(projectId, sessionId));
        hadLive.current = false;
      },
    }
  );

  // A ref, not a dependency: new handlers would reconnect the stream and drop events in between.
  const loaded = useRef(false);
  useEffect(() => {
    loaded.current = data !== undefined;
  }, [data]);
  const refreshTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(refreshTimer.current), []);

  const eventHandlers = useMemo(() => {
    const patch = (apply: (rows: TraceRow[]) => TraceRow[]) => {
      // Patching before the first load lands would discard it; the refresh below picks the update up instead.
      if (loaded.current) void mutate((rows) => rows && apply(rows), { revalidate: false });
      clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => void mutate(), SETTLE_MS);
    };
    return {
      trace_update: (event: MessageEvent) => {
        const deltas = parse<{ traces?: RealtimeTracePayload[] }>(event)?.traces ?? [];
        if (deltas.length === 0) return;
        hadLive.current = true;
        setLive((prev) => new Set([...prev, ...deltas.map((d) => d.id)]));
        patch((rows) => applyTraceDeltas(rows, deltas));
      },
      trace_agent_input_update: (event: MessageEvent) => {
        const payload = parse<RealtimeAgentInputPayload>(event);
        if (payload?.traceId) patch((rows) => applyAgentInput(rows, payload.traceId, payload.agentInput));
      },
    };
  }, [mutate]);
  useRealtime({ key: `session_${sessionId}`, projectId, eventHandlers, enabled: !!projectId });

  const loaders = useMemo(
    () => ({
      loadReply: createIdBatcher((ids) =>
        postIds<Record<string, string | null>>(`/api/projects/${projectId}/traces/output`, ids)
      ),
      loadCounts: createIdBatcher((ids) =>
        postIds<Record<string, TraceSpanCounts>>(`/api/projects/${projectId}/traces/span-counts`, ids)
      ),
    }),
    [projectId]
  );

  const value = useMemo(
    () => ({ traces: data ?? NO_TRACES, live, isLoading, error: error?.message, ...loaders }),
    [data, live, isLoading, error, loaders]
  );
  return <SessionDataContext.Provider value={value}>{children}</SessionDataContext.Provider>;
}

export function useSessionData(): SessionData {
  const value = useContext(SessionDataContext);
  if (!value) throw new Error("useSessionData must be used within SessionDataProvider");
  return value;
}
