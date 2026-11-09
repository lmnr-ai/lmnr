"use client";

import { debounce } from "lodash";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSWRConfig } from "swr";

import { useRealtime } from "@/lib/hooks/use-realtime";
import { type RealtimeAgentInputPayload, type RealtimeTracePayload } from "@/lib/traces/types";

import { fetchSessionTraces, sessionModelTokensUrl } from "../session-api";
import { useChatSession } from "../store";
import { type TracesPatch } from "../store/traces";
import { applyAgentInput, applyTraceDeltas } from "./live-traces";

// Refresh from the server once live updates pause this long; ClickHouse lags the realtime stream.
const SETTLE_MS = 2000;

const parse = <T,>(event: MessageEvent): T | undefined => {
  try {
    return JSON.parse(event.data) as T;
  } catch {
    return undefined;
  }
};

/**
 * Keeps the store's session traces in sync: loads them, patches them with `session_<id>` realtime deltas, and
 * refreshes once the stream goes quiet.
 */
export function SessionTracesSync({ sessionId }: { sessionId: string }) {
  const { projectId } = useParams<{ projectId: string }>();
  const { mutate } = useSWRConfig();
  const patchTraces = useChatSession((s) => s.patchTraces);
  const receiveTraces = useChatSession((s) => s.receiveTraces);
  const failTraces = useChatSession((s) => s.failTraces);
  const hadLive = useRef(false);
  // Set while a refresh is scheduled: a fetch that lands then may predate the latest updates, so it doesn't settle.
  const refreshPending = useRef(false);
  const inFlight = useRef<AbortController>(undefined);
  // Patches applied while the current fetch is in flight; its rows may predate them.
  const patchesSinceFetch = useRef<TracesPatch[]>([]);

  const load = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    patchesSinceFetch.current = [];
    let result: Awaited<ReturnType<typeof fetchSessionTraces>>;
    try {
      result = await fetchSessionTraces(projectId, sessionId, controller.signal);
    } catch (err) {
      // fetchApi rethrows aborts; a newer fetch or unmount superseded this one.
      if (controller.signal.aborted) return;
      throw err;
    }
    if (controller.signal.aborted) return;

    const { traces, error } = result;
    const settled = !refreshPending.current;
    if (traces) receiveTraces(traces, settled, patchesSinceFetch.current);
    else failTraces(error ?? "Failed to load the session.", settled);
    // Settled turns changed the session's token totals.
    if (settled && hadLive.current) {
      hadLive.current = false;
      void mutate(sessionModelTokensUrl(projectId, sessionId));
    }
  }, [projectId, sessionId, receiveTraces, failTraces, mutate]);

  useEffect(() => {
    if (!projectId) return;
    void load();
    return () => inFlight.current?.abort();
  }, [projectId, load]);

  const runRefresh = useCallback(() => {
    refreshPending.current = false;
    void load();
  }, [load]);
  const refresh = useMemo(() => debounce(runRefresh, SETTLE_MS), [runRefresh]);
  useEffect(() => () => refresh.cancel(), [refresh]);

  // Each update pushes the refresh back, so it runs once updates pause.
  const eventHandlers = useMemo(() => {
    const patch = (apply: TracesPatch, liveIds?: string[]) => {
      refreshPending.current = true;
      patchesSinceFetch.current.push(apply);
      patchTraces(apply, liveIds);
      refresh();
    };
    return {
      trace_update: (event: MessageEvent) => {
        const deltas = parse<{ traces?: RealtimeTracePayload[] }>(event)?.traces ?? [];
        if (deltas.length === 0) return;
        hadLive.current = true;
        patch(
          (rows) => applyTraceDeltas(rows, deltas),
          deltas.map((d) => d.id)
        );
      },
      trace_agent_input_update: (event: MessageEvent) => {
        const payload = parse<RealtimeAgentInputPayload>(event);
        if (payload?.traceId) patch((rows) => applyAgentInput(rows, payload.traceId, payload.agentInput));
      },
    };
  }, [patchTraces, refresh]);
  useRealtime({ key: `session_${sessionId}`, projectId, eventHandlers, enabled: !!projectId });

  return null;
}
