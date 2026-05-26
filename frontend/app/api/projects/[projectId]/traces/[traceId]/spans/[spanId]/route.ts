import { getSpan, updateSpanOutput } from "@/lib/actions/span";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string; traceId: string; spanId: string }>(async (_req, ctx) => {
  const params = await ctx.params;
  const { projectId, traceId, spanId } = params;

  const span = await getSpan({ spanId, traceId, projectId });

  return Response.json(span);
});

export const PATCH = apiHandler<{ projectId: string; traceId: string; spanId: string }>(async (req, ctx) => {
  const params = await ctx.params;
  const { projectId, spanId, traceId } = params;

  const body = await req.json();

  await updateSpanOutput({
    spanId,
    projectId,
    traceId,
    output: body?.output,
  });

  return Response.json({ success: true });
});
