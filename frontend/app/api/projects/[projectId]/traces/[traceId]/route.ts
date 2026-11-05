import { getTrace, updateTraceVisibility } from "@/lib/actions/trace";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string; traceId: string }>(async (_req, ctx) => {
  const params = await ctx.params;
  const projectId = params.projectId;
  const traceId = params.traceId;

  const trace = await getTrace({ traceId, projectId });

  if (!trace) {
    return Response.json({ error: "Trace not found" }, { status: 404 });
  }

  return Response.json(trace);
});

export const PUT = apiHandler<{ projectId: string; traceId: string }>(async (req, ctx) => {
  const params = await ctx.params;

  const projectId = params.projectId;
  const traceId = params.traceId;

  const body = (await req.json()) as { visibility: "private" | "public" };

  await updateTraceVisibility({ projectId, visibility: body?.visibility, traceId });

  return Response.json("Updated trace visibility successfully.");
});
