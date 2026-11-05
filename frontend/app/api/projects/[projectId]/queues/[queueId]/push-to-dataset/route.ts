import { z } from "zod/v4";

import { pushItemsToDataset } from "@/lib/actions/queue";
import { withAudit } from "@/lib/audit";

const BodySchema = z.object({
  datasetId: z.guid(),
  itemIds: z.array(z.guid()).optional(),
  includeUnlabelled: z.boolean().optional(),
});

export const POST = withAudit<{ projectId: string; queueId: string }>(
  { resource: "datapoint", action: "create" },
  async (req, ctx, audit) => {
    const { projectId, queueId } = await ctx.params;
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: "Invalid request body", details: parsed.error }, { status: 400 });
    }

    // The datapoints land in the dataset; without this the path's queueId would be the resource.
    audit.set({ resourceId: parsed.data.datasetId, metadata: { queueId, itemIds: parsed.data.itemIds } });

    const result = await pushItemsToDataset({
      projectId,
      queueId,
      datasetId: parsed.data.datasetId,
      itemIds: parsed.data.itemIds,
      includeUnlabelled: parsed.data.includeUnlabelled,
    });

    audit.set({ metadata: { queueId, itemIds: parsed.data.itemIds, pushed: result.pushed } });
    return Response.json(result);
  }
);
