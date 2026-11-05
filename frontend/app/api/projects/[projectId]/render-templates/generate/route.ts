import { generateTemplate } from "@/lib/actions/render-template/generate";
import { apiHandler } from "@/lib/api/api-handler";
import { noAudit } from "@/lib/audit";

// Auth/membership is enforced by proxy.ts middleware for all /api/projects/* routes.
export const POST = noAudit(
  "LLM generation of a template draft; saving it is audited",
  apiHandler<{ projectId: string }>(async (req, ctx) => {
    const { projectId } = await ctx.params;
    const body = await req.json();
    return Response.json(await generateTemplate({ ...body, projectId }));
  })
);
