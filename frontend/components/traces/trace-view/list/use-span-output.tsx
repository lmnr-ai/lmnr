import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useTraceViewBaseStore } from "@/components/traces/trace-view/store/base";
import { convertToTimeParameters } from "@/lib/time.ts";

/**
 * Fetches a single span's raw output on-demand.
 *
 * @param spanId - The span to fetch output for.
 * @param enabled - When false the hook is inert (no fetch, returns undefined).
 */
export function useSpanOutput(spanId: string | undefined, enabled: boolean) {
  const { projectId } = useParams<{ projectId: string }>();
  const trace = useTraceViewBaseStore((state) => state.trace);

  const [result, setResult] = useState<{ spanId: string; output: any } | undefined>(undefined);

  useEffect(() => {
    if (!enabled || !spanId || !trace?.id) return;

    // Determine endpoint: use shared endpoint when projectId is not available (shared trace view)
    const isShared = !projectId;
    const url = isShared
      ? `/api/shared/traces/${trace.id}/spans/outputs`
      : `/api/projects/${projectId}/traces/${trace.id}/spans/outputs`;

    let cancelled = false;
    const body: Record<string, any> = { spanIds: [spanId] };

    if (trace.startTime && trace.endTime) {
      const startTime = new Date(new Date(trace.startTime).getTime() - 1000).toISOString();
      const endTime = new Date(new Date(trace.endTime).getTime() + 1000).toISOString();
      const params = convertToTimeParameters({ startTime, endTime });
      body.startDate = params.start_time;
      body.endDate = params.end_time;
    }

    fetch(url, {
      method: "POST",
      body: JSON.stringify(body),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.outputs?.[spanId] !== undefined) {
          setResult({ spanId, output: data.outputs[spanId] });
        } else {
          setResult({ spanId, output: null });
        }
      })
      .catch(() => {
        if (!cancelled) setResult({ spanId, output: null });
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, spanId, trace?.id, trace?.startTime, trace?.endTime, projectId]);

  // Return undefined if the result is stale (from a different spanId)
  if (!result || result.spanId !== spanId) return undefined;
  return result.output;
}
