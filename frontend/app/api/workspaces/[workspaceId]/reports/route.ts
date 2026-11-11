import { getReports, optInReport, optOutReport, setEmailSubscriptions } from "@/lib/actions/reports";
import { apiHandler } from "@/lib/api/api-handler";
import { handlerWithAudit } from "@/lib/audit";
import { getServerSession } from "@/lib/auth-session";

export const GET = apiHandler<{ workspaceId: string }>(async (_request, ctx) => {
  const { workspaceId } = await ctx.params;

  const session = await getServerSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await getReports(workspaceId, session.user.id, session.user.email ?? undefined);
  return Response.json(result);
});

// Subscribing and unsubscribing change only the caller's delivery, never the report itself.
export const POST = handlerWithAudit<{ workspaceId: string }>(
  { resource: "report", action: "update" },
  async (request, ctx, audit) => {
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
    if (result.alreadySubscribed) {
      audit.skip();
    } else {
      audit.set({ metadata: { emailSubscription: "subscribed" } });
      await audit.target(body.reportId);
    }
    return Response.json(result);
  }
);

export const PUT = handlerWithAudit<{ workspaceId: string }>(
  { resource: "report", action: "update" },
  async (request, ctx, audit) => {
    const { workspaceId } = await ctx.params;

    const session = await getServerSession();
    const email = session?.user?.email;
    if (!email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const result = await setEmailSubscriptions({ workspaceId, email, subscribedReportIds: body.subscribedReportIds });
    audit.set({ metadata: { emailSubscription: "set" } });
    await audit.target(body.subscribedReportIds);
    return Response.json(result);
  }
);

export const DELETE = handlerWithAudit<{ workspaceId: string }>(
  { resource: "report", action: "update" },
  async (request, ctx, audit) => {
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
    audit.set({ metadata: { emailSubscription: "unsubscribed" } });
    await audit.target(body.reportId);
    const result = await optOutReport({ ...body, workspaceId, email });
    return Response.json(result);
  }
);
