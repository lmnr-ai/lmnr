import { z } from "zod/v4";

import { buildSelectQuery, type QueryParams, type SelectQueryOptions } from "@/lib/actions/common/query-builder";
import { executeQuery } from "@/lib/actions/sql";
import { createDatapoints, type DatapointResult } from "@/lib/clickhouse/datapoints";
import { tryParseJson } from "@/lib/utils";

// Schema for listing versions of a datapoint
export const ListDatapointVersionsSchema = z.object({
  projectId: z.string(),
  datasetId: z.string(),
  datapointId: z.string(),
});

// Schema for creating a new version from an existing one
export const CreateDatapointVersionSchema = z.object({
  projectId: z.string(),
  datasetId: z.string(),
  datapointId: z.string(),
  versionCreatedAt: z.string(), // The timestamp of the version to copy from
});

// Datapoint version column mapping (same as regular datapoint)
const datapointVersionSelectColumns = [
  "id",
  "dataset_id as datasetId",
  "formatDateTime(created_at, '%Y-%m-%dT%H:%i:%S.%fZ') as createdAt",
  "data",
  "target",
  "metadata",
];

/**
 * Build query to list all versions of a specific datapoint
 */
const buildDatapointVersionsQueryWithParams = (datapointId: string, datasetId: string) => {
  const customConditions: Array<{
    condition: string;
    params: QueryParams;
  }> = [
    {
      condition: `id = {datapointId:UUID}`,
      params: { datapointId },
    },
    {
      condition: `dataset_id = {datasetId:UUID}`,
      params: { datasetId },
    },
  ];

  const queryOptions: SelectQueryOptions = {
    select: {
      columns: datapointVersionSelectColumns,
      table: "dataset_datapoint_versions",
    },
    customConditions,
    orderBy: [
      {
        column: "created_at",
        direction: "DESC",
      },
    ],
  };

  return buildSelectQuery(queryOptions);
};

/**
 * Build query to get a specific version of a datapoint
 */
const buildSpecificDatapointVersionQueryWithParams = (
  datapointId: string,
  datasetId: string,
  versionCreatedAt: string
) => {
  const customConditions: Array<{
    condition: string;
    params: QueryParams;
  }> = [
    {
      condition: `id = {datapointId:UUID}`,
      params: { datapointId },
    },
    {
      condition: `dataset_id = {datasetId:UUID}`,
      params: { datasetId },
    },
    {
      condition: `formatDateTime(created_at, '%Y-%m-%dT%H:%i:%S.%fZ') = {versionCreatedAt:String}`,
      params: { versionCreatedAt },
    },
  ];

  const queryOptions: SelectQueryOptions = {
    select: {
      columns: datapointVersionSelectColumns,
      table: "dataset_datapoint_versions",
    },
    customConditions,
    pagination: {
      limit: 1,
      offset: 0,
    },
  };

  return buildSelectQuery(queryOptions);
};

/**
 * List all versions of a specific datapoint
 * Returns versions ordered by created_at DESC (newest first)
 */
export async function listDatapointVersions(input: z.infer<typeof ListDatapointVersionsSchema>) {
  const { projectId, datasetId, datapointId } = ListDatapointVersionsSchema.parse(input);

  const { query, parameters } = buildDatapointVersionsQueryWithParams(datapointId, datasetId);

  const versions = (await executeQuery<Record<string, unknown>>({
    query,
    parameters,
    projectId,
  })) as unknown as DatapointResult[];

  return versions;
}

/**
 * Create a new version of a datapoint by copying an existing version
 * This effectively "sets" an old version as the newest by creating a new entry
 */
export async function createDatapointVersionFromExisting(input: z.infer<typeof CreateDatapointVersionSchema>) {
  const { projectId, datasetId, datapointId, versionCreatedAt } = CreateDatapointVersionSchema.parse(input);

  // First, fetch the version we want to copy
  const { query, parameters } = buildSpecificDatapointVersionQueryWithParams(datapointId, datasetId, versionCreatedAt);

  const versions = (await executeQuery<Record<string, unknown>>({
    query,
    parameters,
    projectId,
  })) as unknown as DatapointResult[];

  if (versions.length === 0) {
    throw new Error("Version not found");
  }

  const versionToCopy = versions[0];

  // Create a new version with the same data but new timestamp
  await createDatapoints(projectId, datasetId, [
    {
      id: datapointId,
      data: tryParseJson(versionToCopy.data) ?? {},
      target: versionToCopy.target ? (tryParseJson(versionToCopy.target) ?? {}) : {},
      metadata: versionToCopy.metadata ? (tryParseJson(versionToCopy.metadata) ?? {}) : {},
      createdAt: new Date().toISOString(),
    },
  ]);

  return {
    success: true,
    message: "New version created successfully",
  };
}
