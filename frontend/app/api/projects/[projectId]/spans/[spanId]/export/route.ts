import { ExportSpanSchema, exportSpanToDataset } from "@/lib/actions/span";
import { withAudit } from "@/lib/audit";

export const POST = withAudit<{ projectId: string; spanId: string }>(
  { resource: "datapoint", action: "create" },
  async (req, ctx, audit) => {
    const { projectId, spanId } = await ctx.params;
    const body = await req.json();

    const result = ExportSpanSchema.safeParse({
      ...body,
      spanId,
      projectId,
    });

    if (!result.success) {
      return Response.json({ error: "Invalid request body", details: result.error.issues }, { status: 400 });
    }

    const { datapointId, traceId } = await exportSpanToDataset(result.data);
    audit.set({ metadata: { spanId, traceId } });
    await audit.target(datapointId, { parent: { datasetId: result.data.datasetId } });

    return Response.json("Span exported to dataset successfully");
  }
);
