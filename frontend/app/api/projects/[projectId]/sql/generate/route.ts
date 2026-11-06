import { generateSql } from "@/lib/actions/sql/generate";
import { apiHandler } from "@/lib/api/api-handler";
import { handlerNoAudit } from "@/lib/audit";

export const POST = handlerNoAudit(
  "LLM query generation; reads no data",
  apiHandler<{ projectId: string }>(async (request, ctx) => {
    const { projectId } = await ctx.params;
    const body = await request.json();

    const result = await generateSql({ ...body, projectId });

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 400 });
    }

    return Response.json({ query: result.result });
  })
);
