import { deleteView, updateView } from "@/lib/actions/view";
import { withAudit } from "@/lib/audit";

type Params = { projectId: string; viewId: string };

export const PATCH = withAudit<Params>({ resource: "view", action: "update" }, async (req, ctx) => {
  const { projectId, viewId } = await ctx.params;
  const body = await req.json();

  const result = await updateView({
    projectId,
    viewId,
    name: body.name,
    config: body.config,
  });

  return Response.json(result);
});

export const DELETE = withAudit<Params>({ resource: "view", action: "delete" }, async (_req, ctx) => {
  const { projectId, viewId } = await ctx.params;
  await deleteView({ projectId, viewId });
  return new Response(null, { status: 204 });
});
