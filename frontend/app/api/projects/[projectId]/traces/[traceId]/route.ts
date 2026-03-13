import { getTrace, updateTraceVisibility } from "@/lib/actions/trace";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute<{ projectId: string; traceId: string }, unknown>(async (_req, params) => {
  const { projectId, traceId } = params;

  const trace = await getTrace({ traceId, projectId });

  if (!trace) {
    throw new Error("Trace not found");
  }

  return trace;
});

export const PUT = handleRoute<{ projectId: string; traceId: string }, unknown>(async (req, params) => {
  const { projectId, traceId } = params;

  const body = (await req.json()) as { visibility: "private" | "public" };

  await updateTraceVisibility({ projectId, visibility: body?.visibility, traceId });

  return "Updated trace visibility successfully.";
});
