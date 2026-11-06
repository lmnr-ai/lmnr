import { listProjectLlmProfileOptions } from "@/lib/actions/llm-profiles";
import { apiHandler } from "@/lib/api/api-handler";

/** Picker payload for the signal form: the project's workspace profiles with their models. */
export const GET = apiHandler<{ projectId: string }>(async (_req, ctx) => {
  const { projectId } = await ctx.params;
  return Response.json(await listProjectLlmProfileOptions({ projectId }));
});
