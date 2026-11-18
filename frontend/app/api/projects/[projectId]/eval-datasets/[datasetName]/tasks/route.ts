import { type NextRequest } from "next/server";

import { getEvalDatasetTasks } from "@/lib/actions/eval-datasets";
import { apiHandler } from "@/lib/api/api-handler";

/** The dataset's tasks with their latest version, by name; `?search=` narrows by name. */
export const GET = apiHandler<{ projectId: string; datasetName: string }>(async (req: NextRequest, ctx) => {
  const { projectId, datasetName } = await ctx.params;
  const params = req.nextUrl.searchParams;
  return Response.json(
    await getEvalDatasetTasks({
      projectId,
      datasetName,
      pageNumber: params.get("pageNumber") ?? undefined,
      pageSize: params.get("pageSize") ?? undefined,
      search: params.get("search"),
    })
  );
});
