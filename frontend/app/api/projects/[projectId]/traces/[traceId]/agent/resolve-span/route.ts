import { resolveSpanId } from "@/lib/actions/trace/agent/spans";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute<{ projectId: string; traceId: string }, unknown>(async (req, params) => {
  const { projectId, traceId } = params;

  const url = new URL(req.url);
  const sequentialId = url.searchParams.get("id");

  if (!sequentialId || isNaN(parseInt(sequentialId, 10)) || parseInt(sequentialId, 10) <= 0) {
    throw new Error("Invalid span ID");
  }

  const spanUuid = await resolveSpanId(projectId, traceId, parseInt(sequentialId, 10));

  if (!spanUuid) {
    throw new Error("Span not found");
  }

  return { spanId: spanUuid };
});
