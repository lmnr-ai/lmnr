import { createExportJob } from "@/lib/actions/sql";
import { handleRoute } from "@/lib/api/route-handler";

export const POST = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const body = await req.json();

  const result = await createExportJob({
    projectId: params.projectId,
    ...body,
  });

  return {
    success: true,
    message: result.message,
    jobId: result.jobId,
    warnings: result.warnings,
  };
});
