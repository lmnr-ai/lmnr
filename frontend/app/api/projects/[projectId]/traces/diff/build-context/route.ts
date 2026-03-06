import { getTraceStructureAsString } from "@/lib/actions/trace/agent/spans";

export async function POST(req: Request, props: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await props.params;
  const { traceId, excludeDefault } = await req.json();

  const t0 = performance.now();
  console.log(`[DIFF-TIMING] buildTraceContext START traceId=${traceId.slice(0, 8)} t=${new Date().toISOString()}`);

  try {
    const result = await getTraceStructureAsString(projectId, traceId, { excludeDefault });
    console.log(
      `[DIFF-TIMING] buildTraceContext END   traceId=${traceId.slice(0, 8)} duration=${(performance.now() - t0).toFixed(0)}ms`
    );
    return Response.json(result);
  } catch (error) {
    console.error("buildTraceContext failed:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to build trace context" },
      { status: 500 }
    );
  }
}
