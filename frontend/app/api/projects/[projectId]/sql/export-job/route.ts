import { createExportJob } from "@/lib/actions/sql/export-job";
import { handlerWithAudit } from "@/lib/audit";

// The export job runs the validated SQL outside app-server, so this is the last point that sees it.
export const POST = handlerWithAudit<{ projectId: string }>(
  { resource: "sql", action: "export", noTarget: true },
  async (req, ctx, audit) => {
    const { projectId } = await ctx.params;

    const body = await req.json();
    audit.set({ metadata: { query: body?.sqlQuery, datasetId: body?.datasetId } });

    const result = await createExportJob({
      ...body,
      projectId,
    });
    audit.set({
      metadata: { query: body?.sqlQuery, datasetId: body?.datasetId, jobId: result.jobId },
    });

    return Response.json({
      success: true,
      message: result.message,
      jobId: result.jobId,
      warnings: result.warnings,
    });
  }
);
