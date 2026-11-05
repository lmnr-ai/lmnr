import { deleteSignal, getSignal, updateSignal } from "@/lib/actions/signals";
import { apiHandler } from "@/lib/api/api-handler";
import { withAudit } from "@/lib/audit";

export const GET = apiHandler<{ projectId: string; id: string }>(async (_request, ctx) => {
  const { id, projectId } = await ctx.params;

  const result = await getSignal({ id, projectId });

  if (!result) {
    return Response.json({ error: "Signal not found" }, { status: 404 });
  }
  return Response.json(result);
});

export const PUT = withAudit<{ projectId: string; id: string }>(
  { resource: "signal", action: "update" },
  async (request, ctx) => {
    const { projectId, id } = await ctx.params;

    const body = await request.json();
    const result = await updateSignal({ id, projectId, ...body });

    if (!result) {
      return Response.json({ error: "Signal not found" }, { status: 404 });
    }

    return Response.json(result);
  }
);

export const DELETE = withAudit<{ projectId: string; id: string }>(
  { resource: "signal", action: "delete" },
  async (_request, ctx) => {
    const { projectId, id } = await ctx.params;

    const result = await deleteSignal({ projectId, id });

    if (!result) {
      return Response.json({ error: "Signal not found" }, { status: 404 });
    }

    return Response.json(result);
  }
);
