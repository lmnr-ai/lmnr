import { executeQuery } from "@/lib/actions/sql";
import { apiHandler } from "@/lib/api/api-handler";
import { handlerNoAudit } from "@/lib/audit";

export const POST = handlerNoAudit(
  "audited by app-server as sql.query (source editor)",
  apiHandler<{ projectId: string }>(async (request, ctx) => {
    const body = await request.json();
    const projectId = (await ctx.params).projectId;

    const data = await executeQuery({ ...body, projectId });

    return Response.json(data);
  })
);
