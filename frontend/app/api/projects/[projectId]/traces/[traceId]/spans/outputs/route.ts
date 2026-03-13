import { getSpanOutputs } from "@/lib/actions/spans/outputs.ts";
import { handleRoute } from "@/lib/api/route-handler";

export const POST = handleRoute<{ projectId: string; traceId: string }, unknown>(async (req, params) => {
  const { projectId, traceId } = params;

  const body = await req.json();
  const { spanIds, startDate, endDate } = body;

  return { outputs: await getSpanOutputs({ projectId, traceId, spanIds, startDate, endDate }) };
});
