import { parseUrlParams } from "@/lib/actions/common/utils";
import { getTraceSpans, GetTraceSpansSchema } from "@/lib/actions/spans";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute<{ projectId: string; traceId: string }, unknown>(async (req, params) => {
  const { projectId, traceId } = params;

  const parseResult = parseUrlParams(
    new URL(req.url).searchParams,
    GetTraceSpansSchema.omit({ traceId: true, projectId: true })
  );

  if (!parseResult.success) {
    return [];
  }

  return await getTraceSpans({ ...parseResult.data, projectId, traceId });
});
