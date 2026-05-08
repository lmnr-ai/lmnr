import { z } from "zod/v4";

import { pushItemsToDataset } from "@/lib/actions/queue";

const BodySchema = z.object({
  datasetId: z.guid(),
  itemIds: z.array(z.guid()).optional(),
  includeUnlabelled: z.boolean().optional(),
});

export async function POST(request: Request, props: { params: Promise<{ projectId: string; queueId: string }> }) {
  const { projectId, queueId } = await props.params;

  try {
    const body = await request.json();
    const parsed = BodySchema.safeParse(body);
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
  } catch (error) {
    console.error("Error pushing items to dataset:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
