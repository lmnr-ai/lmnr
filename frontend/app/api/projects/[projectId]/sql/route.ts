import { executeQueryWithTables } from "@/lib/actions/sql";
import { handlerWithAudit } from "@/lib/audit";

// The SQL editor, dashboards and custom columns. app-server stores the query text
// literal-stripped for hybrid workspaces.
export const POST = handlerWithAudit<{ projectId: string }>(
  { resource: "sql", action: "query", noTarget: true },
  async (request, ctx, audit) => {
    const body = await request.json();
    const projectId = (await ctx.params).projectId;
    audit.set({ metadata: { query: body?.query } });

    const { rows, tables } = await executeQueryWithTables({ ...body, projectId });
    audit.set({ metadata: { query: body?.query, tables } });

    return Response.json(rows);
  }
);
