"use client";

import { useMemo } from "react";
import useSWR from "swr";

import RowScoreChip from "@/components/evaluation/poc/row-score-chips/chip";
import { type RunPoint } from "@/components/evaluation/poc/row-score-chips/history-card";
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
  const index = typeof row?.["index"] === "number" ? (row["index"] as number) : undefined;

  const url = useMemo(() => {
    if (index === undefined) return null;
    // Only the newest MAX_RUNS are shown, so cap the ids here too — a group with
    // hundreds of runs would otherwise blow past the URL length limit (414).
    const ids = [...evaluations]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .slice(-MAX_RUNS)
      .map((e) => e.id)
      .join(",");
    return `/api/projects/${projectId}/evaluations/datapoint-comparison?evaluationIds=${ids}&index=${index}`;
  }, [projectId, evaluations, index]);

  const { data } = useSWR<{ rows: EvaluationDatapointComparisonRow[] }>(url, swrFetcher, {
    revalidateOnFocus: false,
  });

  // Runs in group order (oldest first), deduped by evaluationId (RMT pre-merge
  // duplicates; keep last seen), capped to the most recent MAX_RUNS.
  const runs = useMemo(() => {
    const evalById = new Map(evaluations.map((e) => [e.id, e]));
    const byEval = new Map<string, EvaluationDatapointComparisonRow>();
    (data?.rows ?? []).forEach((r) => byEval.set(r.evaluationId, r));
    return Array.from(byEval.values())
      .map((r) => ({ row: r, ev: evalById.get(r.evaluationId) }))
      .sort((a, b) => new Date(a.ev?.createdAt ?? 0).getTime() - new Date(b.ev?.createdAt ?? 0).getTime())
      .slice(-MAX_RUNS);
  }, [data, evaluations]);

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
