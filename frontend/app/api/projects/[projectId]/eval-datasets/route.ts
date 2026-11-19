import { type NextRequest } from "next/server";

import { getEvalDatasets } from "@/lib/actions/eval-datasets";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string }>(async (req: NextRequest, ctx) => {
  const { projectId } = await ctx.params;
  const params = req.nextUrl.searchParams;
  return Response.json(
    await getEvalDatasets({
      projectId,
      pageNumber: params.get("pageNumber") ?? undefined,
      pageSize: params.get("pageSize") ?? undefined,
    })
  );
});
