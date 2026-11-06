import { testLlmProfile } from "@/lib/actions/llm-profiles/test";
import { apiHandler } from "@/lib/api/api-handler";
import { handlerNoAudit } from "@/lib/audit";

export const POST = handlerNoAudit(
  "connectivity probe of an LLM profile; changes nothing",
  apiHandler<{ workspaceId: string }>(async (req, ctx) => {
    const { workspaceId } = await ctx.params;
    const body = await req.json();
    return Response.json(await testLlmProfile({ ...body, workspaceId }));
  })
);
