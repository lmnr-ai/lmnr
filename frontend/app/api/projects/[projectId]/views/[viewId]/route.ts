import { deleteView, updateView } from "@/lib/actions/view";
import { handlerWithAudit } from "@/lib/audit";

type Params = { projectId: string; viewId: string };

export const PATCH = handlerWithAudit<Params>({ resource: "view", action: "update" }, async (req, ctx, audit) => {
  const { projectId, viewId } = await ctx.params;
  const body = await req.json();

  const result = await updateView({
    projectId,
    viewId,
    name: body.name,
    config: body.config,
  });
  await audit.target(viewId);

  return Response.json(result);
});

export const DELETE = handlerWithAudit<Params>({ resource: "view", action: "delete" }, async (_req, ctx, audit) => {
  const { projectId, viewId } = await ctx.params;
  await audit.target(viewId);
  await deleteView({ projectId, viewId });
  return new Response(null, { status: 204 });
});
