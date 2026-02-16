import { type CellContext } from "@tanstack/react-table";
import { useParams } from "next/navigation";
import { useCallback } from "react";

import JsonTooltip from "@/components/ui/json-tooltip";
import { type EvalRow } from "@/lib/evaluation/types";

export const DataCell = ({ getValue, column, row }: CellContext<EvalRow, unknown>) => {
  const { projectId } = useParams();
  const fullSql = column.columnDef.meta?.fullSql;
  const datapointId = row.original["id"] as string | undefined;
  const evaluationId = row.original["evaluationId"] as string | undefined;
  const canFetch = !!(fullSql && datapointId && evaluationId && projectId);

  const onFetchFull = useCallback(async () => {
    if (!canFetch) return null;
    const columnParam = JSON.stringify({ id: column.id, sql: fullSql });
    const params = new URLSearchParams({ datapointId, column: columnParam });
    const res = await fetch(`/api/projects/${projectId}/evaluations/${evaluationId}/cell?${params}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json.value;
  }, [canFetch, column.id, fullSql, datapointId, projectId, evaluationId]);

  return <JsonTooltip data={getValue()} columnSize={column.getSize()} onOpen={canFetch ? onFetchFull : undefined} />;
};
