import { removeQueueItem, RemoveQueueItemRequestSchema, updateQueueItemEdit } from "@/lib/actions/queue";
import { apiHandler } from "@/lib/api/api-handler";
import { noAudit } from "@/lib/audit";

type Params = { projectId: string; queueId: string; itemId: string };

/**
 * PATCH body: `{ edit?: string, status?: 0 | 1 }`. `edit` is the full edited
 * target as a JSON string (UI-only — `payload` is immutable post-insert).
 * Pass `edit: ""` to clear an edit; omit it to leave the column untouched.
 */
export const PATCH = noAudit(
  "per-item labeling traffic",
  apiHandler<Params>(async (req, ctx) => {
    const { projectId, queueId, itemId } = await ctx.params;
    const body = await req.json();
    await updateQueueItemEdit({
      projectId,
      queueId,
      id: itemId,
      edit: typeof body?.edit === "string" ? body.edit : undefined,
      status: body?.status === 0 || body?.status === 1 ? body.status : undefined,
    });
    return Response.json({ success: true });
  })
);

export const DELETE = noAudit(
  "per-item labeling traffic",
  apiHandler<Params>(async (req, ctx) => {
    const { projectId, queueId, itemId } = await ctx.params;
    const body = await req.json().catch(() => ({}));
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
  })
);
