import { getSpan, updateSpanOutput } from "@/lib/actions/span";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute<{ projectId: string; traceId: string; spanId: string }, unknown>(
  async (_req, params) => {
    const { projectId, traceId, spanId } = params;

    return await getSpan({ spanId, traceId, projectId });
  }
);

export const PATCH = handleRoute<{ projectId: string; traceId: string; spanId: string }, unknown>(
  async (req, params) => {
    const { projectId, spanId, traceId } = params;

    const body = await req.json();

    await updateSpanOutput({
      spanId,
      projectId,
      traceId,
      output: body?.output,
    });

    return { success: true };
  }
);
