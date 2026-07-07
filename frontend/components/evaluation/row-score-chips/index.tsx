"use client";

import { useMemo } from "react";
import useSWR from "swr";

import RowScoreChip from "@/components/evaluation/row-score-chips/chip";
import { type RunPoint } from "@/components/evaluation/row-score-chips/history-card";
import { type EvaluationDatapointComparisonRow } from "@/lib/actions/evaluation";
import { type EvalRow, type Evaluation as EvaluationType } from "@/lib/evaluation/types";
import { formatTimestamp } from "@/lib/utils";

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
    index !== undefined && idsKey.length > 0
      ? ([`/api/projects/${projectId}/evaluations/datapoint-comparison`, idsKey, index] as const)
      : null;

  const { data } = useSWR<{ rows: EvaluationDatapointComparisonRow[] }>(
    swrKey,
    async ([url, ids, idx]: readonly [string, string, number]) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evaluationIds: ids.split(","), index: idx }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Failed to load datapoint comparison.");
      }
      return res.json();
    },
    { revalidateOnFocus: false }
  );

  // Order fetched rows by run order (oldest first); drop runs that don't contain
  // this datapoint index. Dedup by evaluationId (RMT pre-merge).
  const runs = useMemo(() => {
    const byEval = new Map<string, EvaluationDatapointComparisonRow>();
    (data?.rows ?? []).forEach((r) => byEval.set(r.evaluationId, r));
    return sortedEvals
      .map((ev) => ({ ev, row: byEval.get(ev.id) }))
      .filter((x): x is { ev: EvaluationType; row: EvaluationDatapointComparisonRow } => !!x.row);
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
