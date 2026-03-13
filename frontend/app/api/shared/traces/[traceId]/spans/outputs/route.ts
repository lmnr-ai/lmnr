import { getSharedSpanOutputs } from "@/lib/actions/shared/spans/outputs.ts";
import { handleRoute } from "@/lib/api/route-handler";

export const POST = handleRoute<{ traceId: string }, { outputs: Awaited<ReturnType<typeof getSharedSpanOutputs>> }>(
  async (req, { traceId }) => {
    const body = await req.json();
    const { spanIds, startDate, endDate } = body;

    const outputs = await getSharedSpanOutputs({ traceId, spanIds, startDate, endDate });
    return { outputs };
  }
);
