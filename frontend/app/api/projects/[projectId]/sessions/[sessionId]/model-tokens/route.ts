import { getSessionModelTokens } from "@/lib/actions/sessions/model-tokens";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string; sessionId: string }>(async (_req, ctx) => {
  const { projectId, sessionId } = await ctx.params;
  return Response.json(await getSessionModelTokens({ projectId, sessionId }));
});
