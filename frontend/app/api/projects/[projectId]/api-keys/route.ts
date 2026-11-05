import { createApiKey, deleteApiKey, getApiKeys } from "@/lib/actions/project-api-keys";
import { apiHandler } from "@/lib/api/api-handler";
import { getServerSession } from "@/lib/auth-session";

export const POST = apiHandler<{ projectId: string }>(async (req, ctx) => {
  const { projectId } = await ctx.params;
  const body = await req.json();
  const session = await getServerSession();

  // expiresDays: positive integer days, or null/undefined for "never".
  const expiresDays = typeof body.expiresDays === "number" ? body.expiresDays : null;
  const expiresAt =
    expiresDays && expiresDays > 0 ? new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000).toISOString() : null;

  const result = await createApiKey({
    projectId,
    name: body.name,
    isIngestOnly: body.isIngestOnly,
    userId: session?.user.id ?? null,
    expiresAt,
  });

  return Response.json(result);
});

export const GET = apiHandler<{ projectId: string }>(async (_req, ctx) => {
  const { projectId } = await ctx.params;
  return Response.json(await getApiKeys({ projectId }));
});

export const DELETE = apiHandler<{ projectId: string }>(async (req, ctx) => {
  const { projectId } = await ctx.params;
  const body = await req.json();
  await deleteApiKey({ projectId, id: body.id });
  return new Response(null, { status: 200 });
});
