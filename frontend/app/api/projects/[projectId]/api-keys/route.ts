import { createApiKey, deleteApiKey, getApiKeys } from "@/lib/actions/project-api-keys";
import { handleRoute } from "@/lib/api/route-handler";

export const POST = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const body = await req.json();

  return await createApiKey({
    projectId: params.projectId,
    name: body.name,
    isIngestOnly: body.isIngestOnly,
  });
});

export const GET = handleRoute<{ projectId: string }, unknown>(
  async (_req, params) =>
    await getApiKeys({
      projectId: params.projectId,
    })
);

export const DELETE = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const body = await req.json();

  await deleteApiKey({
    projectId: params.projectId,
    id: body.id,
  });

  return { success: true };
});
