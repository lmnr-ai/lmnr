import { getReports, optInReport, optOutReport, setEmailSubscriptions } from "@/lib/actions/reports";
import { apiHandler } from "@/lib/api/api-handler";
import { getServerSession } from "@/lib/auth-session";

export const GET = apiHandler<{ workspaceId: string }>(async (_request, ctx) => {
  const { workspaceId } = await ctx.params;

  const session = await getServerSession();
  const userEmail = session?.user?.email ?? undefined;
  const result = await getReports(workspaceId, userEmail);
  return Response.json(result);
});

export const POST = apiHandler<{ workspaceId: string }>(async (request, ctx) => {
  const { workspaceId } = await ctx.params;

  const session = await getServerSession();
  const email = session?.user?.email;
  if (!email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  if (body.email && body.email !== email) {
    return Response.json({ error: "Cannot manage report subscriptions for other users." }, { status: 403 });
  }
  const result = await optInReport({ ...body, workspaceId, email });
  return Response.json(result);
});

export const PUT = apiHandler<{ workspaceId: string }>(async (request, ctx) => {
  const { workspaceId } = await ctx.params;

  const session = await getServerSession();
  const email = session?.user?.email;
  if (!email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  const result = await setEmailSubscriptions({ workspaceId, email, subscribedReportIds: body.subscribedReportIds });
  return Response.json(result);
});

export const DELETE = apiHandler<{ workspaceId: string }>(async (request, ctx) => {
  const { workspaceId } = await ctx.params;

  const session = await getServerSession();
  const email = session?.user?.email;
  if (!email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  if (body.email && body.email !== email) {
    return Response.json({ error: "Cannot manage report subscriptions for other users." }, { status: 403 });
  }
  const result = await optOutReport({ ...body, workspaceId, email });
  return Response.json(result);
});
