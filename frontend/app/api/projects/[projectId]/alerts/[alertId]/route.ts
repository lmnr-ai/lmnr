import { patchAlert } from "@/lib/actions/alerts";
import { apiHandler } from "@/lib/api/api-handler";
import { getServerSession } from "@/lib/auth-session";

export const PATCH = apiHandler<{ projectId: string; alertId: string }>(async (request, ctx) => {
  const { projectId, alertId } = await ctx.params;

  const session = await getServerSession();
  const userEmail = session?.user?.email ?? undefined;
  const body = await request.json();

  return Response.json(await patchAlert({ projectId, alertId, userEmail, body }));
});
