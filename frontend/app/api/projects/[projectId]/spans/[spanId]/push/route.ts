import { PushSpanSchema, pushSpanToLabelingQueue } from "@/lib/actions/span";
import { apiHandler } from "@/lib/api/api-handler";

export const POST = apiHandler<{ projectId: string; spanId: string }>(async (req, ctx) => {
  const { projectId, spanId } = await ctx.params;
  const body = await req.json();

  const result = PushSpanSchema.safeParse({
    ...body,
    projectId,
    spanId,
  });

  if (!result.success) {
    return Response.json({ error: "Invalid request body", details: result.error.issues }, { status: 400 });
  }

  await pushSpanToLabelingQueue(result.data);

  return Response.json("Span pushed to labeling queue successfully");
});
