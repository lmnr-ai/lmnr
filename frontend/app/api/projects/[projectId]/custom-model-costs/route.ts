import { deleteCustomModelCost, getCustomModelCosts, upsertCustomModelCost } from "@/lib/actions/custom-model-costs";
import { apiHandler } from "@/lib/api/api-handler";
import { handlerWithAudit } from "@/lib/audit";

export const GET = apiHandler<{ projectId: string }>(async (_req, ctx) => {
  const { projectId } = await ctx.params;
  return Response.json(await getCustomModelCosts({ projectId }));
});

export const POST = handlerWithAudit<{ projectId: string }>(
  { resource: "custom_model_cost", action: "create" },
  async (req, ctx, audit) => {
    const { projectId } = await ctx.params;
    const body = await req.json();
    // The cost dialog edits through this route too, sending the row's id.
    if (body.id) audit.set({ action: "update" });

    const { result } = await upsertCustomModelCost({
      id: body.id,
      projectId,
      provider: body.provider,
      model: body.model,
      costs: body.costs,
      previousModel: body.previousModel,
      previousProvider: body.previousProvider,
    });
    await audit.target(result.id, { name: result.model });

    return Response.json(result);
  }
);

export const DELETE = handlerWithAudit<{ projectId: string }>(
  { resource: "custom_model_cost", action: "delete" },
  async (req, ctx, audit) => {
    const { projectId } = await ctx.params;
    const id = req.nextUrl.searchParams.get("id") ?? "";
    await audit.target(id);
    await deleteCustomModelCost({ projectId, id });
    return new Response(null, { status: 200 });
  }
);
