import { type CellContext } from "@tanstack/react-table";
import { useParams } from "next/navigation";
import { useCallback } from "react";

import { useEvalStore } from "@/components/evaluation/store";
import JsonTooltip from "@/components/ui/json-tooltip";
import { type EvalRow } from "@/lib/evaluation/types";

import { ComparisonCell } from "./comparison-cell";

const formatValue = (v: unknown): string => {
  if (v == null) return "-";
  if (typeof v === "string") return v || "-";
  if (typeof v === "number") return String(v);
  return JSON.stringify(v);
};

export const DataCell = ({ getValue, column, row }: CellContext<EvalRow, unknown>) => {
  const { projectId } = useParams();
  const isComparison = useEvalStore((s) => s.isComparison);
  const isShared = useEvalStore((s) => s.isShared);
  const fullSql = column.columnDef.meta?.fullSql;
  const isTruncatedColumn = column.columnDef.meta?.truncated === true;
  const isCustom = column.columnDef.meta?.isCustom === true;
  const dataType = column.columnDef.meta?.dataType;
  const datapointId = row.original["id"] as string | undefined;
  const evaluationId = row.original["evaluationId"] as string | undefined;

  const value = getValue();
  const valueStr = typeof value === "string" ? value : JSON.stringify(value);
  const isDataTruncated = isTruncatedColumn && valueStr?.length === 200;

  const canFetch = !!(isDataTruncated && !isShared && fullSql && datapointId && evaluationId && projectId);

  const onFetchFull = useCallback(async () => {
    if (!canFetch) return null;
    const columnParam = JSON.stringify({ id: column.id, sql: fullSql });
    const params = new URLSearchParams({ datapointId, column: columnParam });
    const res = await fetch(`/api/projects/${projectId}/evaluations/${evaluationId}/cell?${params}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json.value;
  }, [canFetch, column.id, fullSql, datapointId, projectId, evaluationId]);

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

  return <JsonTooltip data={getValue()} columnSize={column.getSize()} onOpen={canFetch ? onFetchFull : undefined} />;
};
