import { getSharedSpan } from "@/lib/actions/shared/span";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute<{ traceId: string; spanId: string }, Awaited<ReturnType<typeof getSharedSpan>>>(
  async (_req, { traceId, spanId }) => getSharedSpan({ traceId, spanId })
);
