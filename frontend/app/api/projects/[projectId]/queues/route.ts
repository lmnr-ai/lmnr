import { prettifyError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import { createQueue, deleteQueues, getQueues, GetQueuesSchema } from "@/lib/actions/queues";
import { apiHandler } from "@/lib/api/api-handler";
import { withAudit } from "@/lib/audit";

export const POST = withAudit<{ projectId: string }>(
  { resource: "labeling_queue", action: "create" },
  async (req, ctx) => {
    const { projectId } = await ctx.params;
    const body = await req.json();
    return Response.json(await createQueue({ projectId, name: body.name }));
  }
);

export const GET = apiHandler<{ projectId: string }>(async (req, ctx) => {
  const { projectId } = await ctx.params;

  const parseResult = parseUrlParams(req.nextUrl.searchParams, GetQueuesSchema.omit({ projectId: true }));

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  return Response.json(await getQueues({ ...parseResult.data, projectId }));
});

export const DELETE = withAudit<{ projectId: string }>(
  { resource: "labeling_queue", action: "delete" },
  async (req, ctx) => {
    const { projectId } = await ctx.params;
    const queueIds = req.nextUrl.searchParams.get("queueIds")?.split(",");

    if (!queueIds) {
      return Response.json({ error: "At least one Queue ID is required" }, { status: 400 });
    }

    await deleteQueues({ projectId, queueIds });

    return Response.json({ message: "Queues deleted successfully" });
  }
);
