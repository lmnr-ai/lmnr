import { prettifyError, ZodError } from "zod/v4";

import { removeQueueItem, RemoveQueueItemRequestSchema, updateQueueItemTarget } from "@/lib/actions/queue";

export async function PATCH(
  request: Request,
  props: { params: Promise<{ projectId: string; queueId: string; itemId: string }> }
) {
  const { projectId, queueId, itemId } = await props.params;

  try {
    const body = await request.json();
    await updateQueueItemTarget({
      projectId,
      queueId,
      id: itemId,
      target: body?.target,
      isLabelled: body?.isLabelled,
    });
    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    console.error("Error updating queue item:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ projectId: string; queueId: string; itemId: string }> }
) {
  const { projectId, queueId, itemId } = await props.params;

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = RemoveQueueItemRequestSchema.safeParse({ ...body, id: itemId });
    if (!parsed.success) {
      return Response.json({ error: "Invalid request body", details: parsed.error }, { status: 400 });
    }
    await removeQueueItem({
      projectId,
      queueId,
      id: itemId,
      skip: parsed.data.skip,
      datasetId: parsed.data.datasetId,
      data: parsed.data.data,
      target: parsed.data.target,
      metadata: parsed.data.metadata,
    });
    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Invalid request parameters")) {
      return Response.json({ error: "Invalid request parameters" }, { status: 400 });
    }
    console.error("Error deleting queue item:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
