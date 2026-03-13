import { parseUrlParams } from "@/lib/actions/common/utils";
import { countTraces, GetTracesSchema } from "@/lib/actions/traces";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const { projectId } = params;

  const parseResult = parseUrlParams(new URL(req.url).searchParams, GetTracesSchema.omit({ projectId: true }));

  if (!parseResult.success) {
    return { count: 0 };
  }

  return await countTraces({ ...parseResult.data, projectId });
});
