export interface RenderData {
  spans?: unknown[];
  truncated?: boolean;
}

// Runs the trace's span WHERE clause via the render-data endpoint. Shared by the
// SpanFilter "Test" button and the auto-fetch that follows a trace generation.
// Throws with the server error message on failure so each caller renders it its way.
export async function fetchRenderData(
  projectId: string,
  traceId: string,
  whereClause: string | null,
  signal?: AbortSignal
): Promise<RenderData> {
  const res = await fetch(`/api/projects/${projectId}/traces/${traceId}/render-data`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({ whereClause: whereClause ?? null }),
  });
  if (!res.ok) {
    const errMessage = await res
      .json()
      .then((d) => d?.error)
      .catch(() => null);
    throw new Error(errMessage ?? "Failed to run the filter");
  }
  return res.json();
}
