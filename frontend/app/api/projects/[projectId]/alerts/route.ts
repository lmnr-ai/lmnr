import { getServerSession } from "next-auth";

import { createAlert, deleteAlert, getAlerts } from "@/lib/actions/alerts";
import { apiHandler } from "@/lib/api/api-handler";
import { authOptions } from "@/lib/auth";

export const GET = apiHandler<{ projectId: string }>(async (_request, ctx) => {
  const { projectId } = await ctx.params;

  const session = await getServerSession(authOptions);
  const userEmail = session?.user?.email ?? undefined;
  const result = await getAlerts(projectId, userEmail);
  return Response.json(result);
});

export const POST = apiHandler<{ projectId: string }>(async (request, ctx) => {
  const { projectId } = await ctx.params;

  const session = await getServerSession(authOptions);
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  const emailTargets = (body.targets ?? []).filter((t: { type: string; email?: string }) => t.type === "EMAIL");
  if (emailTargets.some((t: { email?: string }) => t.email && t.email !== userEmail)) {
    return Response.json({ error: "Cannot create alert targets for other users' emails." }, { status: 403 });
  }
  const result = await createAlert({ ...body, projectId });
  return Response.json(result);
});

export const DELETE = apiHandler<{ projectId: string }>(async (request, ctx) => {
  const { projectId } = await ctx.params;

  const body = await request.json();
  const result = await deleteAlert({ ...body, projectId });
  return Response.json(result);
});
