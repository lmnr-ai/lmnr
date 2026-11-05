import { PushSpanSchema, pushSpanToLabelingQueue } from "@/lib/actions/span";
import { withAudit } from "@/lib/audit";

export const POST = withAudit<{ projectId: string; spanId: string }>(
  { resource: "labeling_queue", action: "update" },
  async (req, ctx, audit) => {
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

    await audit.target(result.data.queueId);
    await pushSpanToLabelingQueue(result.data);

    return Response.json("Span pushed to labeling queue successfully");
  }
);
