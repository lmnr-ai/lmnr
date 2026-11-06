import { deleteView, updateView } from "@/lib/actions/view";
import { apiHandler } from "@/lib/api/api-handler";

type Params = { projectId: string; viewId: string };

export const PATCH = apiHandler<Params>(async (req, ctx) => {
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

export const DELETE = apiHandler<Params>(async (_req, ctx) => {
  const { projectId, viewId } = await ctx.params;
  await deleteView({ projectId, viewId });
  return new Response(null, { status: 204 });
});
