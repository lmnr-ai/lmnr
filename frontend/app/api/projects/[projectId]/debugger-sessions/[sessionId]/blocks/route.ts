import { getSessionBlocks, getSessionTraceRows } from "@/lib/actions/debugger-sessions";
import { apiHandler } from "@/lib/api/api-handler";

type Params = { projectId: string; sessionId: string };

// `GET …/blocks` → `{ blocks }` — lightweight ordered index (id-only trace refs).
export const GET = apiHandler<Params>(async (_req, ctx) => {
  const { projectId, sessionId } = await ctx.params;
  return Response.json({ blocks: await getSessionBlocks({ projectId, sessionId }) });
});

// `POST …/blocks` with body `{ traceIds }` → `{ traces }` — window fetch of full
// rows. POST, not a query string, so a full id window can't overflow the URL.
export const POST = apiHandler<Params>(async (req, ctx) => {
  const { projectId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { traceIds?: unknown };
  const traceIds = Array.isArray(body.traceIds)
    ? body.traceIds.filter((id): id is string => typeof id === "string")
    : [];
  return Response.json({ traces: await getSessionTraceRows({ projectId, traceIds }) });
});
