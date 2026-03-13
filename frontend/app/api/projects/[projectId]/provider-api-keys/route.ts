import { createProviderApiKey, deleteProviderApiKey, getProviderApiKeys } from "@/lib/actions/provider-api-keys";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute<{ projectId: string }, unknown>(
  async (_req, params) =>
    await getProviderApiKeys({
      projectId: params.projectId,
    })
);

export const POST = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const body = await req.json();

  await createProviderApiKey({
    projectId: params.projectId,
    name: body.name,
    value: body.value,
  });

  return { success: true };
});

export const DELETE = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name") ?? "";

  await deleteProviderApiKey({
    projectId: params.projectId,
    name,
  });

  return { success: true };
});
