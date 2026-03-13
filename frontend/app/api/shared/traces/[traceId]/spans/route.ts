import { getSharedSpans } from "@/lib/actions/shared/spans";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute<{ traceId: string }, Awaited<ReturnType<typeof getSharedSpans>>>(
  async (_req, { traceId }) => getSharedSpans({ traceId })
);
