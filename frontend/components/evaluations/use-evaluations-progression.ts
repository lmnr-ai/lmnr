import { useMemo } from "react";
import useSWR from "swr";

import { type AggregationFunction } from "@/lib/clickhouse/types";
import { type ScoreRange } from "@/lib/colors";
import { type EvaluationTimeProgression } from "@/lib/evaluation/types";

interface UseEvaluationsProgressionResult {
  /** Raw whole-group progression (one point per run), or undefined while loading. */
  progression: EvaluationTimeProgression[] | undefined;
  isLoading: boolean;
  /** Sorted, de-duplicated score names across every run in the group. */
  scoreNames: string[];
  /** Per-run aggregated score map: evaluationId → { scoreName → value | null }. */
  scoresByEvalId: Record<string, Record<string, number | null>>;
  /** Per-score min/max across the whole group — the heatmap input. */
  scoreRanges: Record<string, ScoreRange>;
  /** Every run id in the group (whole group, not just the loaded table page). */
  allRunIds: string[];
}

/**
 * Single source for the evaluations-group progression payload. The endpoint
 * returns one aggregated point per run for the whole group; this hook parses it
 * ONCE into the shapes the page needs (chart points are derived downstream in
 * ProgressionChart from `progression`). Previously these four derivations were
 * inlined in evaluations.tsx, each re-walking the same array.
 */
export function useEvaluationsProgression(
  projectId: string | undefined,
  groupId: string | null,
  aggregate: AggregationFunction
): UseEvaluationsProgressionResult {
  const url = groupId
    ? `/api/projects/${projectId}/evaluation-groups/${encodeURIComponent(groupId)}/progression`
    : null;
  const body = useMemo(() => ({ aggregate }), [aggregate]);

  const { data: progression, isLoading } = useSWR<EvaluationTimeProgression[]>(
    url ? [url, body] : null,
    async ([u, b]: [string, object]) => {
      const res = await fetch(u, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(b),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error: string };
        throw new Error(err.error);
      }
      return res.json();
    }
  );

  const { scoreNames, scoresByEvalId } = useMemo(() => {
    const names = Array.from(new Set(progression?.flatMap((p) => p.names) ?? [])).sort();
    const byEvalId: Record<string, Record<string, number | null>> = {};
    for (const point of progression ?? []) {
      const map: Record<string, number | null> = {};
      for (const name of names) {
        const idx = point.names.indexOf(name);
        if (idx === -1) {
          map[name] = null;
        } else {
          const v = Number(point.values[idx]);
          map[name] = isNaN(v) ? null : v;
        }
      }
      byEvalId[point.evaluationId] = map;
    }
    return { scoreNames: names, scoresByEvalId: byEvalId };
  }, [progression]);

  const allRunIds = useMemo(() => progression?.map((p) => p.evaluationId) ?? [], [progression]);

  const scoreRanges = useMemo<Record<string, ScoreRange>>(() => {
    const out: Record<string, ScoreRange> = {};
    for (const name of scoreNames) {
      let min = Infinity;
      let max = -Infinity;
      for (const evalId of Object.keys(scoresByEvalId)) {
        const v = scoresByEvalId[evalId]?.[name];
        if (typeof v === "number" && !isNaN(v)) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
      if (min !== Infinity) out[name] = { min, max };
    }
    return out;
  }, [scoreNames, scoresByEvalId]);

  return { progression, isLoading, scoreNames, scoresByEvalId, scoreRanges, allRunIds };
}
