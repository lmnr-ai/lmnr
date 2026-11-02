"use client";

import { useMemo } from "react";
import useSWR from "swr";

import RowScoreChip from "@/components/evaluation/row-score-chips/chip";
import { type RunPoint } from "@/components/evaluation/row-score-chips/history-card";
import { type EvaluationTrialComparisonRow } from "@/lib/actions/evaluation";
import { taskMeanScores } from "@/lib/evaluation/task-groups";
import { type EvalRow, type Evaluation as EvaluationType } from "@/lib/evaluation/types";
import { formatTimestamp } from "@/lib/utils";

interface RowScoreChipsProps {
  projectId: string;
  /** All evaluations in the group — the runs the history line spans. */
  evaluations: EvaluationType[];
  currentEvaluationId: string;
  scoreNames: string[];
  /** The selected Trial whose per-row values the chips show. */
  row?: EvalRow;
}

/**
 * The selected row's scores, shown above the trace view when a Trial is
 * open. One fetch covers every score: the trial-comparison endpoint
 * returns this TASK's scores across all runs in the group, and each chip's
 * hover grows a line card of its score over those runs.
 */
export default function RowScoreChips({
  projectId,
  evaluations,
  currentEvaluationId,
  scoreNames,
  row,
}: RowScoreChipsProps) {
  const taskId = row?.["taskId"] != null ? String(row["taskId"]) : undefined;

  // Every run in the group, oldest first — the full history line, no cap. The
  // current run is always present (it's part of the group), so no special-casing.
  const sortedEvals = useMemo(
    () => [...evaluations].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [evaluations]
  );

  // Stable SWR key: the id list is part of the key so a group change refetches,
  // but the ids ride the POST body (see route — unbounded, so no URL cap).
  const idsKey = useMemo(() => sortedEvals.map((e) => e.id).join(","), [sortedEvals]);
  const swrKey =
    taskId !== undefined && idsKey.length > 0
      ? ([`/api/projects/${projectId}/evaluations/trial-comparison`, idsKey, taskId] as const)
      : null;

  const { data } = useSWR<{ rows: EvaluationTrialComparisonRow[] }>(
    swrKey,
    async ([url, ids, task]: readonly [string, string, string]) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evaluationIds: ids.split(","), taskId: task }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Failed to load trial comparison.");
      }
      return res.json();
    },
    { revalidateOnFocus: false }
  );

  // Order fetched rows by run order (oldest first); drop runs that don't contain
  // this task. A run with several Trials of the task contributes their mean.
  const runs = useMemo(() => {
    const trialsByEval = new Map<string, EvaluationTrialComparisonRow[]>();
    (data?.rows ?? []).forEach((r) =>
      trialsByEval.set(r.evaluationId, [...(trialsByEval.get(r.evaluationId) ?? []), r])
    );
    const byEval = new Map(
      [...trialsByEval].map(([evaluationId, trials]) => [
        evaluationId,
        {
          ...trials[0],
          scores: taskMeanScores(trials.map((t) => ({ task_id: t.taskId, scores: t.scores })))[0]?.scores ?? {},
        },
      ])
    );
    return sortedEvals
      .map((ev) => ({ ev, row: byEval.get(ev.id) }))
      .filter((x): x is { ev: EvaluationType; row: EvaluationTrialComparisonRow } => !!x.row);
  }, [data, sortedEvals]);

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
