import { z } from "zod/v4";

import { OperatorLabelMap } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils.ts";
import { type Filter } from "@/lib/actions/common/filters";
import {
  backtickEscape,
  buildSelectQuery,
  type ColumnFilterConfig,
  type ColumnFilterProcessor,
  createCustomFilter,
  type QueryParams,
  type QueryResult,
  type SelectQueryOptions,
} from "@/lib/actions/common/query-builder";

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

export const datapointsColumnFilterConfig: ColumnFilterConfig = {
  processors: new Map([
    [
      "metadata",
      createCustomFilter(
        (filter, paramKey) => {
          const [key, val] = String(filter.value).split("=", 2);
          if (key && val) {
            return (
              `(simpleJSONExtractString(metadata, {${paramKey}_key:String}) = {${paramKey}_val:String}` +
              ` OR simpleJSONExtractRaw(metadata, {${paramKey}_key:String}) = {${paramKey}_val:String})`
            );
          }
          return "";
        },
        (filter, paramKey) => {
          const [key, val] = String(filter.value).split("=", 2);
          if (key && val) {
            return {
              [`${paramKey}_key`]: key,
              [`${paramKey}_val`]: `${val}`,
            };
          }
          return {};
        }
      ),
    ],
  ]),
};

const ALLOWED_DB_TYPES = new Set(["String", "Float64", "Int64"]);

export interface CustomColumn {
  id: string;
  sql: string;
  filterSql?: string;
  dbType?: string;
}

const CustomColumnsSchema = z.array(
  z.object({
    id: z.string().min(1),
    sql: z.string().min(1),
    filterSql: z.string().optional(),
    dbType: z.enum(["String", "Float64", "Int64"]).optional(),
  })
);

/** Parse and validate a JSON-encoded custom columns string. */
export function parseCustomColumnsJson(json: string | undefined | null): CustomColumn[] | undefined {
  if (!json) return undefined;
  try {
    return CustomColumnsSchema.parse(JSON.parse(json));
  } catch {
    return undefined;
  }
}

/**
 * Build a ColumnFilterConfig that includes both the static datapoint processors
 * and dynamic processors for any custom SQL columns.
 */
const buildFilterConfigWithCustomColumns = (customColumns?: CustomColumn[]): ColumnFilterConfig => {
  if (!customColumns || customColumns.length === 0) {
    return datapointsColumnFilterConfig;
  }

  const processors = new Map(datapointsColumnFilterConfig.processors);

  for (const col of customColumns) {
    const filterSql = col.filterSql ?? col.sql;
    const dbType = ALLOWED_DB_TYPES.has(col.dbType ?? "String") ? (col.dbType ?? "String") : "String";
    const isNumeric = dbType === "Int64" || dbType === "Float64";

    const processor: ColumnFilterProcessor = (filter, paramKey) => {
      const opSymbol = OperatorLabelMap[filter.operator];
      const parsedValue = isNumeric
        ? dbType === "Int64"
          ? parseInt(String(filter.value))
          : parseFloat(String(filter.value))
        : String(filter.value);

      if (isNumeric && isNaN(parsedValue as number)) {
        return { condition: null, params: {} };
      }

      return {
        condition: `${filterSql} ${opSymbol} {${paramKey}:${dbType}}`,
        params: { [paramKey]: parsedValue },
      };
    };

    processors.set(col.id, processor);
  }

  return { processors };
};

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

export const buildDatapointsByIdsQueryWithParams = (options: BuildDatapointsByIdsQueryOptions): QueryResult => {
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
    orderBy: [
      {
        column: "toUInt128(id)",
        direction: "ASC",
      },
    ],
  };

  return buildSelectQuery(queryOptions);
};

export interface BuildDatapointsQueryOptions {
  datasetId?: string;
  searchQuery?: string;
  filters?: Filter[];
  customColumns?: CustomColumn[];
  pageSize: number;
  offset: number;
}

export const buildDatapointsQueryWithParams = (options: BuildDatapointsQueryOptions): QueryResult => {
  const { datasetId, searchQuery, filters, customColumns, pageSize, offset } = options;

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

  const selectColumns = [...datapointSelectColumnsWithSubstring];
  if (customColumns && customColumns.length > 0) {
    for (const col of customColumns) {
      selectColumns.push(`${col.sql} as ${backtickEscape(col.id)}`);
    }
  }

  const queryOptions: SelectQueryOptions = {
    select: {
      columns: selectColumns,
      table: "dataset_datapoints",
    },
    filters,
    columnFilterConfig: buildFilterConfigWithCustomColumns(customColumns),
    customConditions,
    // https://clickhouse.com/docs/sql-reference/data-types/uuid
    orderBy: [
      {
        column: "toUInt128(id)",
        direction: "ASC",
      },
    ],
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
  filters?: Filter[];
  customColumns?: CustomColumn[];
}

export const buildDatapointCountQueryWithParams = (options: BuildDatapointCountQueryOptions): QueryResult => {
  const { datasetId, searchQuery, filters, customColumns } = options;

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
    filters,
    columnFilterConfig: buildFilterConfigWithCustomColumns(customColumns),
    customConditions,
  };

  return buildSelectQuery(queryOptions);
};

export interface BuildAllDatapointsQueryOptions {
  projectId: string;
  datasetId: string;
}

export const buildAllDatapointsQueryWithParams = (options: BuildAllDatapointsQueryOptions): QueryResult => {
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
    orderBy: [
      {
        column: "toUInt128(id)",
        direction: "ASC",
      },
    ],
  };

  return buildSelectQuery(queryOptions);
};
