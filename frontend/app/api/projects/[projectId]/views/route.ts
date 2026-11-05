import { createView } from "@/lib/actions/view";
import { getViews } from "@/lib/actions/views";
import { apiHandler } from "@/lib/api/api-handler";
import { withAudit } from "@/lib/audit";

export const GET = apiHandler<{ projectId: string }>(async (req, ctx) => {
  const { projectId } = await ctx.params;
  const resource = req.nextUrl.searchParams.get("resource");

  if (!resource) {
    return Response.json({ error: "resource query parameter is required" }, { status: 400 });
  }

  return Response.json(await getViews({ projectId, resource }));
});

export const POST = withAudit<{ projectId: string }>(
  { resource: "view", action: "create" },
  async (req, ctx, audit) => {
    const { projectId } = await ctx.params;
    const body = await req.json();

    const result = await createView({
      projectId,
      resource: body.resource,
      name: body.name,
      config: body.config,
    });
    await audit.target(result.id, { name: result.name });

    return Response.json(result);
  }
);
