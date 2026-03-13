import { getSharedTrace } from "@/lib/actions/shared/trace";
import { handleRoute,HttpError } from "@/lib/api/route-handler";

export const GET = handleRoute<{ traceId: string }, Awaited<ReturnType<typeof getSharedTrace>>>(
  async (_req, { traceId }) => {
    const trace = await getSharedTrace({ traceId });

    if (!trace) {
      throw new HttpError("Trace not found", 404);
    }

    return trace;
  }
);
