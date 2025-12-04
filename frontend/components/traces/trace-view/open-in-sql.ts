import { mutate } from "swr";
import { v4 } from "uuid";

import { SQLTemplate } from "@/components/sql/sql-editor-store.ts";

type Params =
    | { type: "span"; spanId: string }
    | { type: "trace"; traceId: string };

function buildQuery(params: Params): { query: string; name: string } {
  switch (params.type) {
    case "span":
      return {
        query: `SELECT *\nFROM spans\nWHERE span_id = '${params.spanId}'`,
        name: `Span ${params.spanId}`,
      };
    case "trace":
      return {
        query: `SELECT *\nFROM spans\nWHERE trace_id = '${params.traceId}'\nORDER BY start_time ASC`,
        name: `Trace ${params.traceId}`,
      };
  }
}

export async function openInSqlEditor(projectId: string, params: Params) {
  const { query, name } = buildQuery(params);

  const optimisticData: SQLTemplate = {
    id: v4(),
    name,
    query,
    createdAt: new Date().toISOString(),
    projectId,
  };

  await mutate<SQLTemplate[]>(
    `/api/projects/${projectId}/sql/templates`,
    (currentData = []) => [optimisticData, ...currentData],
    { revalidate: false }
  );

  await fetch(`/api/projects/${projectId}/sql/templates`, {
    method: "POST",
    body: JSON.stringify({
      id: optimisticData.id,
      name: optimisticData.name,
      query: optimisticData.query,
    }),
  });

  window.open(`/project/${projectId}/sql/${optimisticData.id}`, "_blank");
}
