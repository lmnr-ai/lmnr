import { deleteCustomModelCost, getCustomModelCosts, upsertCustomModelCost } from "@/lib/actions/custom-model-costs";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string }>(async (_req, ctx) => {
  const { projectId } = await ctx.params;
  return Response.json(await getCustomModelCosts({ projectId }));
});

export const POST = apiHandler<{ projectId: string }>(async (req, ctx) => {
  const { projectId } = await ctx.params;
  const body = await req.json();

  const { result } = await upsertCustomModelCost({
    id: body.id,
    projectId,
    provider: body.provider,
    model: body.model,
    costs: body.costs,
    previousModel: body.previousModel,
    previousProvider: body.previousProvider,
  });

  return Response.json(result);
});

export const DELETE = apiHandler<{ projectId: string }>(async (req, ctx) => {
  const { projectId } = await ctx.params;
  await deleteCustomModelCost({ projectId, id: req.nextUrl.searchParams.get("id") ?? "" });
  return new Response(null, { status: 200 });
});
