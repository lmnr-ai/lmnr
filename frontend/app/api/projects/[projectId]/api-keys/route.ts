import { createApiKey, deleteApiKey, getApiKeys } from "@/lib/actions/project-api-keys";
import { apiHandler } from "@/lib/api/api-handler";
import { handlerWithAudit } from "@/lib/audit";
import { getServerSession } from "@/lib/auth-session";

export const POST = handlerWithAudit<{ projectId: string }>(
  { resource: "api_key", action: "create" },
  async (req, ctx, audit) => {
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
    audit.set({ metadata: { isIngestOnly: result.isIngestOnly, expiresAt: result.expiresAt } });
    await audit.target(result.id, { name: result.name ?? result.shorthand });

    return Response.json(result);
  }
);

export const GET = apiHandler<{ projectId: string }>(async (_req, ctx) => {
  const { projectId } = await ctx.params;
  return Response.json(await getApiKeys({ projectId }));
});

export const DELETE = handlerWithAudit<{ projectId: string }>(
  { resource: "api_key", action: "delete" },
  async (req, ctx, audit) => {
    const { projectId } = await ctx.params;
    const body = await req.json();
    await audit.target(body.id);
    await deleteApiKey({ projectId, id: body.id });
    return new Response(null, { status: 200 });
  }
);
