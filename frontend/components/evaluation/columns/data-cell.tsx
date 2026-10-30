import { type CellContext } from "@tanstack/react-table";
import { useParams } from "next/navigation";
import { useCallback } from "react";

import { formatScoreValue } from "@/components/evaluation/utils";
import JsonTooltip from "@/components/ui/json-tooltip";
import { taskValueVaries } from "@/lib/evaluation/task-groups";
import { type EvalRow } from "@/lib/evaluation/types";

import { ComparisonCell } from "./comparison-cell";

const formatValue = (v: unknown): string => {
  if (v == null) return "-";
  if (typeof v === "string") return v || "-";
  if (typeof v === "number") return formatScoreValue(v);
  return JSON.stringify(v);
};

export const DataCell = ({ getValue, column, row, table }: CellContext<EvalRow, unknown>) => {
  const { projectId } = useParams();
  const { isComparison = false, isShared = false } = table.options.meta?.evalCellMeta ?? {};
  const fullSql = column.columnDef.meta?.fullSql;
  const isTruncatedColumn = column.columnDef.meta?.truncated === true;
  const isCustom = column.columnDef.meta?.isCustom === true;
  const dataType = column.columnDef.meta?.dataType;
  const trialId = row.original["id"] as string | undefined;
  const evaluationId = row.original["evaluationId"] as string | undefined;

  const value = getValue();
  const valueStr = typeof value === "string" ? value : JSON.stringify(value);
  const isDataTruncated = isTruncatedColumn && valueStr?.length === 200;

  const canFetch = !!(isDataTruncated && !isShared && fullSql && trialId && evaluationId && projectId);

  const onFetchFull = useCallback(async () => {
    if (!canFetch) return null;
    const columnParam = JSON.stringify({ id: column.id, sql: fullSql });
    const params = new URLSearchParams({ trialId, column: columnParam });
    const res = await fetch(`/api/projects/${projectId}/evaluations/${evaluationId}/cell?${params}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json.value;
  }, [canFetch, column.id, fullSql, trialId, projectId, evaluationId]);

  if (taskValueVaries(row.original, column.id)) {
    return <span className="text-muted-foreground">varies</span>;
  }

  // Custom columns in comparison mode: show side-by-side values
  if (isComparison && isCustom) {
    const comparedValue = row.original[`compared:${column.id}`];
    const isNumeric = dataType === "number";

    return (
      <ComparisonCell
        original={formatValue(value)}
        comparison={formatValue(comparedValue)}
        originalValue={isNumeric ? (value as number | undefined) : undefined}
        comparisonValue={isNumeric ? (comparedValue as number | undefined) : undefined}
      />
    );
  }

  // Task rows hold the Trials' mean, so round it like scores.
  const display = dataType === "number" && typeof value === "number" ? formatScoreValue(value) : value;
  return <JsonTooltip data={display} columnSize={column.getSize()} onOpen={canFetch ? onFetchFull : undefined} />;
};
