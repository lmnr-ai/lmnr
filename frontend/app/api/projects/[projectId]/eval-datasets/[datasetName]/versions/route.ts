import { type NextRequest } from "next/server";

import { getEvalDatasetVersions } from "@/lib/actions/eval-datasets";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string; datasetName: string }>(async (req: NextRequest, ctx) => {
  const { projectId, datasetName } = await ctx.params;
  const params = req.nextUrl.searchParams;
  return Response.json(
    await getEvalDatasetVersions({
      projectId,
      datasetName,
      pageNumber: params.get("pageNumber") ?? undefined,
      pageSize: params.get("pageSize") ?? undefined,
    })
  );
});
