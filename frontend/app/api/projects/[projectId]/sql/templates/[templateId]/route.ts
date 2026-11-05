import { deleteSqlTemplate, updateSqlTemplate } from "@/lib/actions/sql/templates";
import { withAudit } from "@/lib/audit";

export const PUT = withAudit<{ projectId: string; templateId: string }>(
  { resource: "sql_template", action: "update" },
  async (req, ctx, audit) => {
    const { projectId, templateId } = await ctx.params;

    const body = await req.json();

    const updatedTemplate = await updateSqlTemplate({
      projectId,
      templateId,
      ...body,
    });
    await audit.target(templateId);

    return Response.json(updatedTemplate);
  }
);

export const DELETE = withAudit<{ projectId: string; templateId: string }>(
  { resource: "sql_template", action: "delete" },
  async (_req, ctx, audit) => {
    const { projectId, templateId } = await ctx.params;
    await audit.target(templateId);

    await deleteSqlTemplate({
      projectId,
      templateId,
    });

    return Response.json({ message: "SQL template deleted successfully" });
  }
);
