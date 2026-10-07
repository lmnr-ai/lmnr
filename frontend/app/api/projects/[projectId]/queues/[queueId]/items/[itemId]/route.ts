import { prettifyError, ZodError } from "zod/v4";

import { removeQueueItem, RemoveQueueItemRequestSchema, updateQueueItemEdit } from "@/lib/actions/queue";

/**
 * PATCH body: `{ edit?: string, status?: 0 | 1 }`. `edit` is the full edited
 * target as a JSON string (UI-only — `payload` is immutable post-insert).
 * Pass `edit: ""` to clear an edit; omit it to leave the column untouched.
 */
export async function PATCH(
  request: Request,
  props: { params: Promise<{ projectId: string; queueId: string; itemId: string }> }
) {
  const { projectId, queueId, itemId } = await props.params;

  try {
    const body = await request.json();
    await updateQueueItemEdit({
      projectId,
      queueId,
      id: itemId,
      edit: typeof body?.edit === "string" ? body.edit : undefined,
      status: body?.status === 0 || body?.status === 1 ? body.status : undefined,
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
