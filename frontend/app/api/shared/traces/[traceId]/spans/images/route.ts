import { getSharedSpanImages } from "@/lib/actions/shared/spans/images";
import { apiHandler } from "@/lib/api/api-handler";

export const POST = apiHandler<{ traceId: string }>(async (req, ctx) => {
  const { traceId } = await ctx.params;

  const body = await req.json();
  const { spanIds } = body;

  if (!Array.isArray(spanIds)) {
    return Response.json({ error: "spanIds must be an array" }, { status: 400 });
  }

  const images = await getSharedSpanImages({ traceId, spanIds });
  return Response.json({ images });
});
