import { createSqlTemplate, getSqlTemplates } from "@/lib/actions/sql/templates";
import { apiHandler } from "@/lib/api/api-handler";
import { withAudit } from "@/lib/audit";

export const GET = apiHandler<{ projectId: string }>(async (_req, ctx) => {
  const { projectId } = await ctx.params;

  const result = await getSqlTemplates({ projectId });

  return Response.json(result);
});

export const POST = withAudit<{ projectId: string }>(
  { resource: "sql_template", action: "create" },
  async (req, ctx, audit) => {
    const { projectId } = await ctx.params;

    const body = await req.json();

    const template = await createSqlTemplate({
      ...body,
      projectId,
    });
    await audit.target(template.id, { name: template.name });

    return Response.json(template);
  }
);
