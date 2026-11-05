import { createExportJob } from "@/lib/actions/sql/export-job";
import { apiHandler } from "@/lib/api/api-handler";
import { noAudit } from "@/lib/audit";

export const POST = noAudit(
  "audited by app-server as sql.query (source export)",
  apiHandler<{ projectId: string }>(async (req, ctx) => {
    const { projectId } = await ctx.params;

    const body = await req.json();

    const result = await createExportJob({
      ...body,
      projectId,
    });

    return Response.json({
      success: true,
      message: result.message,
      jobId: result.jobId,
      warnings: result.warnings,
    });
  })
);
