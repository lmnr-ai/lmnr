import { z } from "zod/v4";

import { buildDatapointQueryWithParams } from "@/lib/actions/datapoints/utils";
import { executeQuery } from "@/lib/actions/sql";
import { createDatapoints, DatapointResult } from "@/lib/clickhouse/datapoints";

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

  // Get datapoint using SQL endpoint
  const { query, parameters } = buildDatapointQueryWithParams({
    datapointId,
    datasetId,
  });


  const datapoints = await executeQuery<Record<string, unknown>>({
    query,
    parameters,
    projectId,
  }) as unknown as DatapointResult[];

  if (datapoints.length === 0) {
    throw new Error("Datapoint not found");
  }

  return datapoints[0];
}

export async function updateDatapoint(input: z.infer<typeof UpdateDatapointSchema>) {
  const { projectId, datapointId, datasetId, data, target, metadata, createdAt } = UpdateDatapointSchema.parse(input);

  // Update in ClickHouse - use the provided createdAt timestamp
  await createDatapoints(projectId, datasetId, [{
    id: datapointId,
    data,
    target,
    metadata,
    createdAt,
  }]);
}
