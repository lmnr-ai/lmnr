import { getTrace, updateTraceVisibility } from "@/lib/actions/trace";
import { apiHandler } from "@/lib/api/api-handler";
import { withAudit } from "@/lib/audit";

export const GET = apiHandler<{ projectId: string; traceId: string }>(async (_req, ctx) => {
  const params = await ctx.params;
  const projectId = params.projectId;
  const traceId = params.traceId;

  const trace = await getTrace({ traceId, projectId });

  if (!trace) {
    return Response.json({ error: "Trace not found" }, { status: 404 });
  }

  return Response.json(trace);
});

export const PUT = withAudit<{ projectId: string; traceId: string }>(
  { resource: "trace", action: "share" },
  async (req, ctx, audit) => {
    const params = await ctx.params;

    const projectId = params.projectId;
    const traceId = params.traceId;

    const body = (await req.json()) as { visibility: "private" | "public" };

    await updateTraceVisibility({ projectId, visibility: body?.visibility, traceId });
    audit.set({ resourceId: traceId, action: body?.visibility === "public" ? "share" : "unshare" });

    return Response.json("Updated trace visibility successfully.");
  }
);
