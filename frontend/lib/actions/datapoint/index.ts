import { z } from "zod/v4";

import { getDatapoint as getClickHouseDatapoint, updateDatapoint as updateClickHouseDatapoint } from "@/lib/clickhouse/datapoints";

export const GetDatapointSchema = z.object({
  projectId: z.string(),
  datapointId: z.string(),
  datasetId: z.string(),
});

export const UpdateDatapointSchema = z.object({
  projectId: z.string(),
  datapointId: z.string(),
  datasetId: z.string(),
  data: z.any(),
  target: z.any().nullable(),
  metadata: z.record(z.string(), z.any()),
  createdAt: z.string(),
});

export const UpdateDatapointRequestSchema = UpdateDatapointSchema.omit({ projectId: true, datapointId: true, datasetId: true });

export async function getDatapoint(input: z.infer<typeof GetDatapointSchema>) {
  const { projectId, datapointId, datasetId } = GetDatapointSchema.parse(input);

  const datapoint = await getClickHouseDatapoint(projectId, datapointId, datasetId);

  if (!datapoint) {
    throw new Error("Datapoint not found");
  }

  return datapoint;
}

export async function updateDatapoint(input: z.infer<typeof UpdateDatapointSchema>) {
  const { projectId, datapointId, datasetId, data, target, metadata, createdAt } = UpdateDatapointSchema.parse(input);

  // Update in ClickHouse
  await updateClickHouseDatapoint(projectId, datapointId, datasetId, data, target, metadata, createdAt);
}
