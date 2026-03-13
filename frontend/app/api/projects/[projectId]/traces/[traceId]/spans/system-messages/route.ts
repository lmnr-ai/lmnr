import { getTraceSystemMessages } from "@/lib/actions/spans/system-messages";
import { handleRoute } from "@/lib/api/route-handler";

export const POST = handleRoute<{ projectId: string; traceId: string }, unknown>(async (req, params) => {
  const { projectId, traceId } = params;

  const body = await req.json();
  const paths = body.paths as string[][];

  if (!Array.isArray(paths)) {
    throw new Error("paths must be an array of path arrays");
  }

  return await getTraceSystemMessages({ projectId, traceId, paths });
});
