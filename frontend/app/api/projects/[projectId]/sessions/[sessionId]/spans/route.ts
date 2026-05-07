import { parseUrlParams } from "@/lib/actions/common/utils";
import { getSessionSpans, GetSessionSpansSchema } from "@/lib/actions/sessions/search-spans";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string; sessionId: string }>(async (req, ctx) => {
  const { projectId, sessionId } = await ctx.params;

  const parseResult = parseUrlParams(
    req.nextUrl.searchParams,
    GetSessionSpansSchema.omit({ projectId: true, sessionId: true })
  );

  if (!parseResult.success) {
    return Response.json({ error: "Invalid request parameters" }, { status: 400 });
  }

  const result = await getSessionSpans({
    ...parseResult.data,
    projectId,
    sessionId,
  });
  return Response.json(result);
});
