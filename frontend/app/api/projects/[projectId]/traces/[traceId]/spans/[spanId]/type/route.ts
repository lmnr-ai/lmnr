import { getSpanType } from "@/lib/actions/span";
import { apiHandler } from "@/lib/api/api-handler";
import { NotFoundError } from "@/lib/api/errors";

export const GET = apiHandler<{ projectId: string; traceId: string; spanId: string }>(async (_req, ctx) => {
  const { projectId, traceId, spanId } = await ctx.params;
  const spanType = await getSpanType({ projectId, traceId, spanId });
  if (!spanType) throw new NotFoundError("Span not found");
  return Response.json({ spanType });
});
