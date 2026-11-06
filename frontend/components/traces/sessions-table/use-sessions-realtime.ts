import { useEffect, useMemo, useRef } from "react";
import { useSWRConfig } from "swr";

import { sessionsStatsUrl } from "@/components/traces/sessions-table/constants";
import { useRealtime } from "@/lib/hooks/use-realtime";
import { type RealtimeTracePayload } from "@/lib/traces/types";

// Session rows aggregate their traces, so a trace delta can't be patched in client-side (it can't tell a
// new trace from a continuing one). Instead, coalesce live traces into one quiet refetch per window.
const REFRESH_DELAY_MS = 2000;

export function useSessionsRealtime({
  projectId,
  enabled,
  onRefresh,
}: {
  projectId: string;
  enabled: boolean;
  onRefresh: () => void;
}) {
  const { mutate } = useSWRConfig();
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (enabled) return;
    clearTimeout(timerRef.current);
    timerRef.current = undefined;
  }, [enabled]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const eventHandlers = useMemo(
    () => ({
      trace_update: (event: MessageEvent) => {
        const payload = JSON.parse(event.data) as { traces?: RealtimeTracePayload[] };
        // A refresh already scheduled will pick this trace up too.
        if (timerRef.current || !payload.traces?.some((t) => t.sessionId)) return;
        timerRef.current = setTimeout(() => {
          timerRef.current = undefined;
          onRefreshRef.current();
          const prefix = sessionsStatsUrl(projectId);
          void mutate((key) => typeof key === "string" && key.startsWith(prefix));
        }, REFRESH_DELAY_MS);
      },
    }),
    [mutate, projectId]
  );

  useRealtime({ key: "traces", projectId, enabled, eventHandlers });
}
