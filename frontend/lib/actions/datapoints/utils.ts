import { buildSelectQuery, QueryParams, QueryResult, SelectQueryOptions } from "@/lib/actions/common/query-builder";

// Datapoint table column mapping
const datapointSelectColumns = [
  "id",
  "dataset_id as datasetId",
  "formatDateTime(created_at, '%Y-%m-%dT%H:%i:%S.%fZ') as createdAt",
  "data",
  "target",
  "metadata",
];

const datapointSelectColumnsWithSubstring = [
  "id",
  "dataset_id as datasetId",
  "formatDateTime(created_at, '%Y-%m-%dT%H:%i:%S.%fZ') as createdAt",
  "substring(data, 1, 1000) as data",
  "substring(target, 1, 1000) as target",
  "metadata",
];

export interface BuildDatapointQueryOptions {
  datapointId: string;
  datasetId: string;
}

export const buildDatapointQueryWithParams = (options: BuildDatapointQueryOptions): QueryResult => {
  const { datapointId, datasetId } = options;

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
      columns: datapointSelectColumns,
      table: "dataset_datapoints",
    },
    customConditions,
    pagination: {
      limit: 1,
      offset: 0,
    },
  };

  return buildSelectQuery(queryOptions);
};

export interface BuildDatapointsByIdsQueryOptions {
  datapointIds: string[];
  datasetId?: string;
}

export const buildDatapointsByIdsQueryWithParams = (
  options: BuildDatapointsByIdsQueryOptions
): QueryResult => {
  const { datapointIds, datasetId } = options;

  if (datapointIds.length === 0) {
    return { query: "", parameters: {} };
  }

  const customConditions: Array<{
    condition: string;
    params: QueryParams;
  }> = [
    {
      condition: `id IN ({datapointIds:Array(UUID)})`,
      params: { datapointIds },
    },
  ];

  if (datasetId) {
    customConditions.push({
      condition: `dataset_id = {datasetId:UUID}`,
      params: { datasetId },
    });
  }

  const queryOptions: SelectQueryOptions = {
    select: {
      columns: datapointSelectColumns,
      table: "dataset_datapoints",
    },
    customConditions,
    // https://clickhouse.com/docs/sql-reference/data-types/uuid
    orderBy: [{
      column: "toUInt128(id)",
      direction: "ASC",
    }],
  };

  return buildSelectQuery(queryOptions);
};

export interface BuildDatapointsQueryOptions {
  datasetId?: string;
  searchQuery?: string;
  pageSize: number;
  offset: number;
}

export const buildDatapointsQueryWithParams = (options: BuildDatapointsQueryOptions): QueryResult => {
  const { datasetId, searchQuery, pageSize, offset } = options;

  const customConditions: Array<{
    condition: string;
    params: QueryParams;
  }> = [];

  if (datasetId) {
    customConditions.push({
      condition: `dataset_id = {datasetId:UUID}`,
      params: { datasetId },
    });
  }

  if (searchQuery) {
    customConditions.push({
      condition: `(data LIKE {searchQuery:String} OR target LIKE {searchQuery:String})`,
      params: { searchQuery: `%${searchQuery}%` },
    });
  }

  const queryOptions: SelectQueryOptions = {
    select: {
      columns: datapointSelectColumnsWithSubstring,
      table: "dataset_datapoints",
    },
    customConditions,
    // https://clickhouse.com/docs/sql-reference/data-types/uuid
    orderBy: [{
      column: "toUInt128(id)",
      direction: "ASC",
    }],
    pagination: {
      limit: pageSize,
      offset,
    },
  };

  return buildSelectQuery(queryOptions);
};

export interface BuildDatapointCountQueryOptions {
  datasetId?: string;
  searchQuery?: string;
}

export const buildDatapointCountQueryWithParams = (
  options: BuildDatapointCountQueryOptions
): QueryResult => {
  const { datasetId, searchQuery } = options;

  const customConditions: Array<{
    condition: string;
    params: QueryParams;
  }> = [];

  if (datasetId) {
    customConditions.push({
      condition: `dataset_id = {datasetId:UUID}`,
      params: { datasetId },
    });
  }

  if (searchQuery) {
    customConditions.push({
      condition: `(data LIKE {searchQuery:String} OR target LIKE {searchQuery:String})`,
      params: { searchQuery: `%${searchQuery}%` },
    });
  }

  const queryOptions: SelectQueryOptions = {
    select: {
      columns: ["COUNT(*) as count"],
      table: "dataset_datapoints",
    },
    customConditions,
  };

  return buildSelectQuery(queryOptions);
};

export interface BuildAllDatapointsQueryOptions {
  projectId: string;
  datasetId: string;
}

export const buildAllDatapointsQueryWithParams = (
  options: BuildAllDatapointsQueryOptions
): QueryResult => {
  const { datasetId } = options;

  const customConditions: Array<{
    condition: string;
    params: QueryParams;
  }> = [
    {
      condition: `dataset_id = {datasetId:UUID}`,
      params: { datasetId },
    },
  ];

  const queryOptions: SelectQueryOptions = {
    select: {
      columns: datapointSelectColumns,
      table: "dataset_datapoints",
    },
    customConditions,
    // https://clickhouse.com/docs/sql-reference/data-types/uuid
    orderBy: [{
      column: "toUInt128(id)",
      direction: "ASC",
    }],
  };

  return buildSelectQuery(queryOptions);
};
