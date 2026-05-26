import { createExportJob } from "@/lib/actions/sql/export-job";
import { apiHandler } from "@/lib/api/api-handler";

export const POST = apiHandler<{ projectId: string }>(async (req, ctx) => {
  const { projectId } = await ctx.params;

  const body = await req.json();

  const result = await createExportJob({
    projectId,
    ...body,
  });

  return Response.json({
    success: true,
    message: result.message,
    jobId: result.jobId,
    warnings: result.warnings,
  });
});
