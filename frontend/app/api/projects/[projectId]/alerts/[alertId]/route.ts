import { AlertEmailTargetError, patchAlert } from "@/lib/actions/alerts";
import { apiHandler } from "@/lib/api/api-handler";
import { getServerSession } from "@/lib/auth-session";

export const PATCH = apiHandler<{ projectId: string; alertId: string }>(async (request, ctx) => {
  const { projectId, alertId } = await ctx.params;

  const session = await getServerSession();
  const userEmail = session?.user?.email ?? undefined;
  const body = await request.json();

  try {
    const result = await patchAlert({ projectId, alertId, userEmail, body });
    return Response.json(result);
  } catch (error) {
    if (error instanceof AlertEmailTargetError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
});
