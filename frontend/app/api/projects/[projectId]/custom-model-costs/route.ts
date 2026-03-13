import { deleteCustomModelCost, getCustomModelCosts, upsertCustomModelCost } from "@/lib/actions/custom-model-costs";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute<{ projectId: string }, unknown>(
  async (_req, params) =>
    await getCustomModelCosts({
      projectId: params.projectId,
    })
);

export const POST = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const body = await req.json();

  const { result } = await upsertCustomModelCost({
    id: body.id,
    projectId: params.projectId,
    provider: body.provider,
    model: body.model,
    costs: body.costs,
    previousModel: body.previousModel,
    previousProvider: body.previousProvider,
  });

  return result;
});

export const DELETE = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id") ?? "";

  await deleteCustomModelCost({
    projectId: params.projectId,
    id,
  });

  return { success: true };
});
