import { getSpanImages } from "@/lib/actions/span/images";
import { apiHandler } from "@/lib/api/api-handler";

export const POST = apiHandler<{ projectId: string; traceId: string }>(async (req, ctx) => {
  const params = await ctx.params;
  const { projectId, traceId } = params;

  const body = await req.json();
  const { spanIds } = body;

  if (!Array.isArray(spanIds)) {
    return Response.json({ error: "spanIds must be an array" }, { status: 400 });
  }

  const images = await getSpanImages({ projectId, traceId, spanIds });
  return Response.json({ images });
});
