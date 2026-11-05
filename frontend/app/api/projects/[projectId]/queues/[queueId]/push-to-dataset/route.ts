import { z } from "zod/v4";

import { pushItemsToDataset } from "@/lib/actions/queue";
import { apiHandler } from "@/lib/api/api-handler";

const BodySchema = z.object({
  datasetId: z.guid(),
  itemIds: z.array(z.guid()).optional(),
  includeUnlabelled: z.boolean().optional(),
});

export const POST = apiHandler<{ projectId: string; queueId: string }>(async (req, ctx) => {
  const { projectId, queueId } = await ctx.params;
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body", details: parsed.error }, { status: 400 });
  }

  const result = await pushItemsToDataset({
    projectId,
    queueId,
    datasetId: parsed.data.datasetId,
    itemIds: parsed.data.itemIds,
    includeUnlabelled: parsed.data.includeUnlabelled,
  });

  return Response.json(result);
});
