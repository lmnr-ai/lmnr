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

  // Get datapoint from ClickHouse
  const datapoint = await getClickHouseDatapoint(projectId, datapointId);

  if (!datapoint) {
    throw new Error("Datapoint not found");
  }

  // Transform ClickHouse data to match expected format
  return {
    id: datapoint.id,
    datasetId: datapoint.dataset_id,
    createdAt: datapoint.created_at,
    data: JSON.parse(datapoint.data),
    target: datapoint.target ? JSON.parse(datapoint.target) : null,
    metadata: JSON.parse(datapoint.metadata),
  };
}

export async function updateDatapoint(input: z.infer<typeof UpdateDatapointSchema>) {
  const { projectId, datapointId, datasetId, data, target, metadata, createdAt } = UpdateDatapointSchema.parse(input);

  // Update in ClickHouse
  await updateClickHouseDatapoint(projectId, datapointId, datasetId, data, target, metadata, createdAt);
}
