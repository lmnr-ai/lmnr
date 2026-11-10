import { useEffect, useMemo, useRef } from "react";
import { useSWRConfig } from "swr";

import { sessionsStatsUrl } from "@/components/traces/sessions-table/constants";
import {
  applyAgentInput,
  applyTraceDelta,
  type LiveSessions,
  mergeRefreshedPage,
} from "@/components/traces/sessions-table/live-sessions";
import { useRealtime } from "@/lib/hooks/use-realtime";
import { type RealtimeAgentInputPayload, type RealtimeTracePayload, type SessionRow } from "@/lib/traces/types";

/** Once the stream goes quiet, check the patched rows against the server (trace count and duration are best-effort). */
const RECONCILE_AFTER_MS = 5000;

type Tracked = Omit<LiveSessions, "rows">;
const initialTracked: Tracked = { traces: {}, pendingInputs: {} };

export function useSessionsRealtime({
  projectId,
  enabled,
  updateData,
  fetchFirstPage,
}: {
  projectId: string;
  enabled: boolean;
  updateData: (updater: (rows: SessionRow[]) => SessionRow[]) => void;
  fetchFirstPage: () => Promise<SessionRow[] | undefined>;
}) {
  const { mutate } = useSWRConfig();
  const trackedRef = useRef<Tracked>(initialTracked);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fetchFirstPageRef = useRef(fetchFirstPage);

  useEffect(() => {
    fetchFirstPageRef.current = fetchFirstPage;
  }, [fetchFirstPage]);

  // Paused or a new query: what was tracked described rows that are being replaced.
  useEffect(() => {
    trackedRef.current = initialTracked;
    return () => clearTimeout(timerRef.current);
  }, [enabled, fetchFirstPage]);

  const eventHandlers = useMemo(() => {
    // updateData runs its updater synchronously, so the tracked state stays in step with the rows.
    const apply = (step: (state: LiveSessions) => LiveSessions) =>
      updateData((rows) => {
        const { rows: next, ...tracked } = step({ rows, ...trackedRef.current });
        trackedRef.current = tracked;
        return next;
      });

    const scheduleReconcile = () => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        void mutate((key) => typeof key === "string" && key.startsWith(sessionsStatsUrl(projectId)));
        const page = await fetchFirstPageRef.current();
        if (page) updateData((rows) => mergeRefreshedPage(rows, page));
      }, RECONCILE_AFTER_MS);
    };

    return {
      trace_update: (event: MessageEvent) => {
        const traces = parse<{ traces?: RealtimeTracePayload[] }>(event)?.traces?.filter((t) => t.sessionId) ?? [];
        if (traces.length === 0) return;
        apply((state) => traces.reduce(applyTraceDelta, state));
        scheduleReconcile();
      },
      trace_agent_input_update: (event: MessageEvent) => {
        const payload = parse<RealtimeAgentInputPayload>(event);
        if (payload?.traceId) apply((state) => applyAgentInput(state, payload.traceId, payload.agentInput));
      },
    };
  }, [mutate, projectId, updateData]);

  useRealtime({ key: "traces", projectId, enabled, eventHandlers });
}

const parse = <T>(event: MessageEvent): T | undefined => {
  try {
    return JSON.parse(event.data) as T;
  } catch {
    return undefined;
  }
};
