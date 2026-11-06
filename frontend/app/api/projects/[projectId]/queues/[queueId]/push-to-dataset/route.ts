import { z } from "zod/v4";

import { pushItemsToDataset } from "@/lib/actions/queue";
import { handlerWithAudit } from "@/lib/audit";

const BodySchema = z.object({
  datasetId: z.guid(),
  itemIds: z.array(z.guid()).optional(),
  includeUnlabelled: z.boolean().optional(),
});

export const POST = handlerWithAudit<{ projectId: string; queueId: string }>(
  // The created datapoint ids aren't returned; the dataset and items are recorded instead.
  { resource: "datapoint", action: "create", noTarget: true },
  async (req, ctx, audit) => {
    const { projectId, queueId } = await ctx.params;
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: "Invalid request body", details: parsed.error }, { status: 400 });
    }

    audit.set({ metadata: { queueId, datasetId: parsed.data.datasetId, itemIds: parsed.data.itemIds } });

    const result = await pushItemsToDataset({
      projectId,
      queueId,
      datasetId: parsed.data.datasetId,
      itemIds: parsed.data.itemIds,
      includeUnlabelled: parsed.data.includeUnlabelled,
    });

    audit.set({
      metadata: { queueId, datasetId: parsed.data.datasetId, itemIds: parsed.data.itemIds, pushed: result.pushed },
    });
    return Response.json(result);
  }
);
