import { deleteSignal, getSignal, updateSignal } from "@/lib/actions/signals";
import { apiHandler } from "@/lib/api/api-handler";
import { handlerWithAudit } from "@/lib/audit";

export const GET = apiHandler<{ projectId: string; id: string }>(async (_request, ctx) => {
  const { id, projectId } = await ctx.params;

  const result = await getSignal({ id, projectId });

  if (!result) {
    return Response.json({ error: "Signal not found" }, { status: 404 });
  }
  return Response.json(result);
});

export const PUT = handlerWithAudit<{ projectId: string; id: string }>(
  { resource: "signal", action: "update" },
  async (request, ctx, audit) => {
    const { projectId, id } = await ctx.params;

    const body = await request.json();
    const result = await updateSignal({ id, projectId, ...body });
    await audit.target(id);

    if (!result) {
      return Response.json({ error: "Signal not found" }, { status: 404 });
    }

    return Response.json(result);
  }
);

export const DELETE = handlerWithAudit<{ projectId: string; id: string }>(
  { resource: "signal", action: "delete" },
  async (_request, ctx, audit) => {
    const { projectId, id } = await ctx.params;

    await audit.target(id);
    const result = await deleteSignal({ projectId, id });

    if (!result) {
      return Response.json({ error: "Signal not found" }, { status: 404 });
    }

    return Response.json(result);
  }
);
