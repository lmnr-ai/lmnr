"use client";

import { useMemo } from "react";
import useSWR from "swr";

import RowScoreChip from "@/components/evaluation/row-score-chips/chip";
import { type RunPoint } from "@/components/evaluation/row-score-chips/history-card";
import { type EvaluationDatapointComparisonRow } from "@/lib/actions/evaluation";
import { type EvalRow, type Evaluation as EvaluationType } from "@/lib/evaluation/types";
import { formatTimestamp, swrFetcher } from "@/lib/utils";

const MAX_RUNS = 30;

interface RowScoreChipsProps {
  projectId: string;
  /** All evaluations in the group — the runs the history line spans. */
  evaluations: EvaluationType[];
  currentEvaluationId: string;
  scoreNames: string[];
  /** The selected datapoint whose per-row values the chips show. */
  row?: EvalRow;
}

/**
 * The selected row's scores, shown above the trace view when a datapoint is
 * open. One fetch covers every score: the datapoint-comparison endpoint
 * returns this INDEX's scores across all runs in the group, and each chip's
 * hover grows a line card of its score over those runs.
 */
export default function RowScoreChips({
  projectId,
  evaluations,
  currentEvaluationId,
  scoreNames,
  row,
}: RowScoreChipsProps) {
  // `index` (Int64) comes back as a JSON string from ClickHouse, so coerce.
  const index = useMemo(() => {
    const raw = row?.["index"];
    if (raw == null) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }, [row]);

  // Newest MAX_RUNS runs (cap keeps the URL under the 414 limit), but always
  // include the run being viewed even when it's older than that window —
  // otherwise its point + isCurrent highlight go missing from the history.
  const windowedEvals = useMemo(() => {
    const byCreatedAt = (a: EvaluationType, b: EvaluationType) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    const sorted = [...evaluations].sort(byCreatedAt);
    const newest = sorted.slice(-MAX_RUNS);
    if (currentEvaluationId && !newest.some((e) => e.id === currentEvaluationId)) {
      const current = sorted.find((e) => e.id === currentEvaluationId);
      if (current) return [...newest, current].sort(byCreatedAt);
    }
    return newest;
  }, [evaluations, currentEvaluationId]);

  const url = useMemo(() => {
    if (index === undefined || windowedEvals.length === 0) return null;
    const ids = windowedEvals.map((e) => e.id).join(",");
    return `/api/projects/${projectId}/evaluations/datapoint-comparison?evaluationIds=${ids}&index=${index}`;
  }, [projectId, windowedEvals, index]);

  const { data } = useSWR<{ rows: EvaluationDatapointComparisonRow[] }>(url, swrFetcher, {
    revalidateOnFocus: false,
  });

  // Order fetched rows by the windowed run order (oldest first); drop runs that
  // don't contain this datapoint index. Dedup by evaluationId (RMT pre-merge).
  const runs = useMemo(() => {
    const byEval = new Map<string, EvaluationDatapointComparisonRow>();
    (data?.rows ?? []).forEach((r) => byEval.set(r.evaluationId, r));
    return windowedEvals
      .map((ev) => ({ ev, row: byEval.get(ev.id) }))
      .filter((x): x is { ev: EvaluationType; row: EvaluationDatapointComparisonRow } => !!x.row);
  }, [data, windowedEvals]);

  const pointsByScore = useMemo(() => {
    const map: Record<string, RunPoint[]> = {};
    for (const name of scoreNames) {
      map[name] = runs.map(({ row: r, ev }) => {
        const v = r.scores[name];
        return {
          evaluationId: r.evaluationId,
          label: ev ? `${ev.name} · ${formatTimestamp(ev.createdAt)}` : "—",
          value: typeof v === "number" && Number.isFinite(v) ? v : null,
          isCurrent: r.evaluationId === currentEvaluationId,
        };
      });
    }
    return map;
  }, [runs, scoreNames, currentEvaluationId]);

  if (!row) return null;

  const ordered = [...scoreNames].sort((a, b) => a.localeCompare(b));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {ordered.map((name) => {
        const raw = row[`score:${name}`];
        return (
          <RowScoreChip
            key={name}
            name={name}
            value={typeof raw === "number" && !Number.isNaN(raw) ? raw : undefined}
            points={pointsByScore[name] ?? []}
          />
        );
      })}
    </div>
  );
}
