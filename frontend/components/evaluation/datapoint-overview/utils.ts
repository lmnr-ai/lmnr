import { type Evaluation as EvaluationType } from "@/lib/evaluation/types";

import { type ComparisonRow } from "./types";

export const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export const fmtNum = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 3 });

export function shortLabel(name: string, createdAt: string): string {
  if (name && name.length > 0) return name.length > 16 ? `${name.slice(0, 14)}…` : name;
  return new Date(createdAt).toLocaleDateString();
}

export type SeriesPoint = {
  id: string;
  label: string;
  createdAt: string;
  evaluationName: string;
  value: number | null;
  isCurrent: boolean;
};

/** Build a chronological series for a single score across the cohort. */
export function buildSeries(
  scoreName: string,
  currentEvaluationId: string,
  evaluations: EvaluationType[],
  rows: ComparisonRow[]
): SeriesPoint[] {
  const byEvalId = new Map<string, ComparisonRow>();
  for (const r of rows) byEvalId.set(r.evaluationId, r);
  const chronological = [...evaluations].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  return chronological.map((e) => {
    const v = byEvalId.get(e.id)?.scores?.[scoreName];
    return {
      id: e.id,
      label: shortLabel(e.name, e.createdAt),
      createdAt: e.createdAt,
      evaluationName: e.name,
      value: isNum(v) ? v : null,
      isCurrent: e.id === currentEvaluationId,
    };
  });
}

export type RankingInfo = {
  rank: number;
  total: number;
  currentValue: number;
  median: number;
  betterThanMedian: boolean;
};

export function computeRanking(series: SeriesPoint[], currentEvaluationId: string): RankingInfo | null {
  const valued = series.filter((d): d is SeriesPoint & { value: number } => isNum(d.value));
  if (valued.length < 2) return null;
  const desc = [...valued].sort((a, b) => b.value - a.value);
  const idx = desc.findIndex((d) => d.id === currentEvaluationId);
  if (idx === -1) return null;
  const asc = [...valued].sort((a, b) => a.value - b.value);
  const mid = (asc.length - 1) / 2;
  const lo = Math.floor(mid);
  const hi = Math.ceil(mid);
  const median = (asc[lo].value + asc[hi].value) / 2;
  return {
    rank: idx + 1,
    total: desc.length,
    currentValue: desc[idx].value,
    median,
    betterThanMedian: desc[idx].value >= median,
  };
}

export function currentValueFor(series: SeriesPoint[]): number | null {
  const cur = series.find((d) => d.isCurrent);
  return cur && isNum(cur.value) ? cur.value : null;
}

export function cohortMean(series: SeriesPoint[]): number | null {
  const valued = series.filter((d): d is SeriesPoint & { value: number } => isNum(d.value));
  if (valued.length === 0) return null;
  return valued.reduce((acc, d) => acc + d.value, 0) / valued.length;
}
