import { getServerSession } from "next-auth";

import { setSlackTargets } from "@/lib/actions/reports";
import { apiHandler } from "@/lib/api/api-handler";
import { authOptions } from "@/lib/auth";

export const POST = apiHandler<{ workspaceId: string }>(async (request, ctx) => {
  const { workspaceId } = await ctx.params;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  const result = await setSlackTargets({ ...body, workspaceId });
  return Response.json(result);
});
