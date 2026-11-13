import { useMemo } from "react";

import { type EvaluationTimeProgression } from "@/lib/evaluation/types";

import { type ProgressionPoint } from "./shared";

interface Options {
  data?: EvaluationTimeProgression[];
  evaluations: { id: string; name: string }[];
  scoreKeys: string[];
  hiddenEvaluationIds: string[];
  baselineEvaluationId?: string;
  groupBy?: string | null;
}

export function useProgressionPoints({
  data,
  evaluations,
  scoreKeys,
  hiddenEvaluationIds,
  baselineEvaluationId,
  groupBy,
}: Options) {
  const rawPoints: ProgressionPoint[] = useMemo(() => {
    const nameById: Record<string, string> = evaluations.reduce((acc, curr) => ({ ...acc, [curr.id]: curr.name }), {});
    return (
      data?.map(({ timestamp, evaluationId, names, values, name, metadata }) => {
        const valueMap: Record<string, number | null> = {};
        for (const score of scoreKeys) {
          const idx = names.indexOf(score);
          const v = idx === -1 ? NaN : Number(values[idx]);
          valueMap[score] = isNaN(v) ? null : v;
        }
        return { timestamp, evaluationId, name: name || nameById[evaluationId] || "-", values: valueMap, metadata };
      }) ?? []
    );
  }, [data, evaluations, scoreKeys]);

  const points: ProgressionPoint[] = useMemo(() => {
    if (!baselineEvaluationId || groupBy) return rawPoints;
    const baselinePoint = rawPoints.find((p) => p.evaluationId === baselineEvaluationId);
    if (!baselinePoint) return rawPoints;
    // Subtract baseline per-score; null baseline or null value → null (no relative signal).
    return rawPoints.map((p) => {
      const rel: Record<string, number | null> = {};
      for (const score of scoreKeys) {
        const v = p.values[score];
        const b = baselinePoint.values[score];
        rel[score] = v === null || b === null ? null : v - b;
      }
      return { ...p, values: rel };
    });
  }, [rawPoints, scoreKeys, baselineEvaluationId, groupBy]);

  // Baseline subtraction above runs over the full group (so a hidden baseline
  // still zeroes the others); hidden runs are dropped only from what's drawn.
  const visiblePoints = useMemo(
    () => points.filter((p) => !hiddenEvaluationIds.includes(p.evaluationId)),
    [points, hiddenEvaluationIds]
  );

  return { visiblePoints };
}
