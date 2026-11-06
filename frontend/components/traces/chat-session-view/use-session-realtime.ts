import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { useSWRConfig } from "swr";

import { useSessionViewStore } from "@/components/traces/session-view/store";
import { useRealtime } from "@/lib/hooks/use-realtime";
import { mergeTraceDelta, realtimeTraceToRow } from "@/lib/traces/realtime";
import { type RealtimeAgentInputPayload, type RealtimeTracePayload, type TraceRow } from "@/lib/traces/types";

import { fetchSessionTraces, sessionModelTokensUrl } from "./session-api";
import { useTurnData } from "./turn-data";
import { useRefreshTurns } from "./use-refresh-turns";

// Wait for a burst of span batches to settle before reconciling with the server.
const SETTLE_MS = 2000;

const byStartTime = (a: TraceRow, b: TraceRow) => Date.parse(a.startTime) - Date.parse(b.startTime);

const parse = <T>(event: MessageEvent): T | undefined => {
  try {
    return JSON.parse(event.data) as T;
  } catch {
    return undefined;
  }
};

/**
 * Live session: subscribes to the `session_<id>` channel. Deltas apply immediately (new turns
 * appear, stats tick) and agent input lands when extracted; once updates go quiet the rows are
 * re-fetched for exact stats, and touched turns' replies, counts, and the model totals reload.
 */
export function useSessionRealtime(sessionId: string) {
  const { projectId } = useParams<{ projectId: string }>();
  const { mutate } = useSWRConfig();
  const setTraces = useSessionViewStore((s) => s.setTraces);
  const refreshTurns = useRefreshTurns();
  const setLive = useTurnData((s) => s.setLive);

  const touched = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Agent input extracted before the turn's first trace_update; applied when the row lands.
  const earlyInputs = useRef(new Map<string, TraceRow["agentInput"]>());

  useEffect(() => () => clearTimeout(timer.current), []);

  const eventHandlers = useMemo(() => {
    const withEarlyInput = (row: TraceRow): TraceRow => {
      const agentInput = earlyInputs.current.get(row.id);
      if (agentInput === undefined) return row;
      earlyInputs.current.delete(row.id);
      return { ...row, agentInput };
    };

    const reconcile = async () => {
      const ids = [...touched.current];
      touched.current.clear();
      // On failure keep the live deltas; the next update schedules another reconcile.
      const { traces } = await fetchSessionTraces(projectId, sessionId);
      if (traces) setTraces(traces);
      refreshTurns(ids);
      setLive(ids, false);
      void mutate(sessionModelTokensUrl(projectId, sessionId));
    };

    return {
      trace_update: (event: MessageEvent) => {
        const updates = parse<{ traces?: RealtimeTracePayload[] }>(event)?.traces ?? [];
        if (updates.length === 0) return;

        setTraces((prev) => {
          const next = [...prev];
          for (const delta of updates) {
            touched.current.add(delta.id);
            const i = next.findIndex((t) => t.id === delta.id);
            if (i >= 0) next[i] = mergeTraceDelta(next[i], delta);
            else next.push(withEarlyInput(realtimeTraceToRow(delta)));
          }
          return next.sort(byStartTime);
        });
        setLive(
          updates.map((u) => u.id),
          true
        );

        clearTimeout(timer.current);
        timer.current = setTimeout(() => void reconcile(), SETTLE_MS);
      },
      trace_agent_input_update: (event: MessageEvent) => {
        const payload = parse<RealtimeAgentInputPayload>(event);
        if (!payload?.traceId) return;
        const agentInput = payload.agentInput as TraceRow["agentInput"];
        setTraces((prev) => {
          if (!prev.some((t) => t.id === payload.traceId)) {
            earlyInputs.current.set(payload.traceId, agentInput);
            return prev;
          }
          return prev.map((t) => (t.id === payload.traceId ? { ...t, agentInput } : t));
        });
      },
    };
  }, [projectId, sessionId, mutate, setTraces, refreshTurns, setLive]);

  useRealtime({ key: `session_${sessionId}`, projectId, eventHandlers, enabled: !!projectId });
}
