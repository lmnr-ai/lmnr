import { parseUrlParams } from "@/lib/actions/common/utils";
import { countTraces, GetTracesSchema } from "@/lib/actions/traces";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string }>(async (req, ctx) => {
  const params = await ctx.params;
  const projectId = params.projectId;

  const parseResult = parseUrlParams(req.nextUrl.searchParams, GetTracesSchema.omit({ projectId: true }));

  if (!parseResult.success) {
    return Response.json({ count: 0 });
  }

  const result = await countTraces({ ...parseResult.data, projectId });
  return Response.json(result);
});
