import { useCallback, useEffect, useState } from "react";
import { useSWRConfig } from "swr";

import {
  applyDatapointUpsertsToRows,
  applyEvaluationCreated,
  applyRunStatsToRows,
  type EvaluationListDatapoint,
} from "@/components/evaluations/realtime";
import { type EvaluationStatusCounts } from "@/lib/evaluation/status";
import { type Evaluation } from "@/lib/evaluation/types";
import { useRealtime } from "@/lib/hooks/use-realtime";

type StatsById = Record<string, EvaluationStatusCounts>;

interface UseEvaluationsRealtimeOptions {
  projectId: string;
  groupId: string | null;
  enabled: boolean;
  updateData: (updater: (rows: Evaluation[]) => Evaluation[]) => void;
  onProgressionInvalidate: () => void;
}

export function useEvaluationsRealtime({
  projectId,
  groupId,
  enabled,
  updateData,
  onProgressionInvalidate,
}: UseEvaluationsRealtimeOptions) {
  const { mutate: mutateSWR } = useSWRConfig();
  const [pendingStatIds, setPendingStatIds] = useState<string[]>([]);

  const queueStats = useCallback((evaluationId: string) => {
    setPendingStatIds((prev) => [...new Set([...prev, evaluationId])]);
  }, []);

  useEffect(() => {
    if (pendingStatIds.length === 0 || !projectId) return;

    const ids = pendingStatIds;
    const timer = window.setTimeout(async () => {
      setPendingStatIds([]);
      try {
        const params = new URLSearchParams();
        ids.forEach((id) => params.append("evaluationId", id));
        const res = await fetch(`/api/projects/${projectId}/evaluations/stats?${params.toString()}`);
        if (!res.ok) return;
        const stats = (await res.json()) as StatsById;
        updateData((rows) => applyRunStatsToRows(rows, stats));
        onProgressionInvalidate();
      } catch {
        // Next event re-queues; don't toast a background reconcile.
      }
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [pendingStatIds, projectId, updateData, onProgressionInvalidate]);

  useRealtime({
    key: "evaluations",
    projectId,
    enabled: enabled && !!projectId,
    eventHandlers: {
      evaluation_created: (event) => {
        try {
          const payload = JSON.parse(event.data) as { evaluation?: Evaluation };
          const incoming = payload.evaluation;
          if (!incoming?.id) return;
          updateData((rows) => applyEvaluationCreated(rows, incoming, groupId));
          void mutateSWR(`/api/projects/${projectId}/evaluation-groups`);
        } catch {
          // Malformed SSE payload; skip.
        }
      },
      datapoint_upsert: (event) => {
        try {
          const payload = JSON.parse(event.data) as {
            evaluationId?: string;
            groupId?: string;
            datapoints?: EvaluationListDatapoint[];
          };
          if (!payload.evaluationId || !payload.datapoints?.length) return;
          if (payload.groupId != null && groupId != null && payload.groupId !== groupId) {
            return;
          }
          updateData((rows) =>
            applyDatapointUpsertsToRows(rows, payload.evaluationId!, payload.groupId, groupId, payload.datapoints!)
          );
          queueStats(payload.evaluationId);
        } catch {
          // Malformed SSE payload; skip.
        }
      },
      trace_update: (event) => {
        try {
          const payload = JSON.parse(event.data) as { evaluationId?: string };
          if (!payload.evaluationId) return;
          queueStats(payload.evaluationId);
        } catch {
          // Malformed SSE payload; skip.
        }
      },
    },
  });
}
