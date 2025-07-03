import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { datasetDatapoints } from "@/lib/db/migrations/schema";

export const GetDatapointSchema = z.object({
  datapointId: z.string(),
  datasetId: z.string(),
});

export const UpdateDatapointSchema = z.object({
  datapointId: z.string(),
  datasetId: z.string(),
  data: z.any(),
  target: z.any().nullable(),
  metadata: z.record(z.string(), z.any()),
});

export const UpdateDatapointRequestSchema = UpdateDatapointSchema.omit({ datapointId: true, datasetId: true });

export async function getDatapoint(input: z.infer<typeof GetDatapointSchema>) {
  const { datapointId, datasetId } = GetDatapointSchema.parse(input);

  const datapoint = await db.query.datasetDatapoints.findFirst({
    where: and(eq(datasetDatapoints.id, datapointId), eq(datasetDatapoints.datasetId, datasetId)),
  });

  if (!datapoint) {
    throw new Error("Datapoint not found");
  }

  return datapoint;
}

export async function updateDatapoint(input: z.infer<typeof UpdateDatapointSchema>) {
  const { datapointId, datasetId, data, target, metadata } = UpdateDatapointSchema.parse(input);

  const [updatedDatapoint] = await db
    .update(datasetDatapoints)
    .set({
      data,
      target,
      metadata,
    })

    .where(and(eq(datasetDatapoints.id, datapointId), eq(datasetDatapoints.datasetId, datasetId)))
    .returning();

  if (!updatedDatapoint) {
    throw new Error("Datapoint not found");
  }

  return updatedDatapoint;
}
