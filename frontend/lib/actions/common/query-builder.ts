import { OperatorLabelMap } from "@/components/ui/datatable-filter/utils";
import { FilterDef } from "@/lib/db/modifiers";

export interface QueryParams {
  [key: string]: string | number | string[] | number[];
}

export interface QueryResult {
  query: string;
  parameters: QueryParams;
}

export interface ConditionResult {
  condition: string | null;
  params: QueryParams;
}

export interface TimeRangeOptions {
  startTime?: string;
  endTime?: string;
  pastHours?: string;
  timeColumn?: string;
}

export interface PaginationOptions {
  limit: number;
  offset: number;
}

export interface SelectOptions {
  columns: string[];
  table: string;
}

export interface OrderByOptions {
  column: string;
  direction?: "ASC" | "DESC";
}

export type ColumnFilterProcessor = (filter: FilterDef, paramKey: string) => ConditionResult;

export interface ColumnFilterConfig {
  processors: Map<string, ColumnFilterProcessor>;
  defaultProcessor?: ColumnFilterProcessor;
}

const buildTimeRangeConditions = (options: TimeRangeOptions): ConditionResult => {
  const { startTime, endTime, pastHours, timeColumn = "start_time" } = options;

  if (pastHours && !isNaN(parseFloat(pastHours))) {
    return {
      condition: `${timeColumn} > now() - INTERVAL {pastHours:UInt32} HOUR`,
      params: { pastHours: parseInt(pastHours) },
    };
  }

  if (startTime) {
    const conditions: string[] = [`${timeColumn} > {startTime:String}`];
    const params: QueryParams = { startTime };

    if (endTime) {
      conditions.push(`${timeColumn} < {endTime:String}`);
      params.endTime = endTime;
    } else {
      conditions.push(`${timeColumn} < now()`);
    }

    return {
      condition: conditions.join(" AND "),
      params,
    };
  }

  return { condition: null, params: {} };
};

const createStringFilter: ColumnFilterProcessor = (filter, paramKey) => {
  const { column, operator, value } = filter;
  const opSymbol = OperatorLabelMap[operator];

  return {
    condition: `${column} ${opSymbol} {${paramKey}:String}`,
    params: { [paramKey]: value },
  };
};

const createNumberFilter =
  (clickHouseType: "Int64" | "Float64" = "Float64"): ColumnFilterProcessor =>
    (filter, paramKey) => {
      const { column, operator, value } = filter;
      const opSymbol = OperatorLabelMap[operator];
      const numValue = clickHouseType === "Int64" ? parseInt(value) : parseFloat(value);

      return {
        condition: `${column} ${opSymbol} {${paramKey}:${clickHouseType}}`,
        params: { [paramKey]: numValue },
      };
    };

const createArrayFilter =
  (clickHouseType: string): ColumnFilterProcessor =>
    (filter, paramKey) => {
      const { column, value } = filter;
      const values = Array.isArray(value) ? value : [value];

      return {
        condition: `${column} IN ({${paramKey}: Array(${clickHouseType})})`,
        params: { [paramKey]: values },
      };
    };

export const createCustomFilter =
  (
    conditionBuilder: (filter: FilterDef, paramKey: string) => string,
    paramBuilder?: (filter: FilterDef, paramKey: string) => QueryParams
  ): ColumnFilterProcessor =>
    (filter, paramKey) => ({
      condition: conditionBuilder(filter, paramKey),
      params: paramBuilder ? paramBuilder(filter, paramKey) : {},
    });

const buildColumnFilters = (filters: FilterDef[], config: ColumnFilterConfig): ConditionResult => {
  const results = filters
    .map((filter, index) => {
      const paramKey = `${filter.column}_${index}`;
      const processor = config.processors.get(filter.column) || config.defaultProcessor;

      return processor ? processor(filter, paramKey) : null;
    })
    .filter((result): result is ConditionResult => result !== null && result.condition !== null);

  const conditions = results.map((r) => r.condition).filter(Boolean) as string[];
  const params = results.reduce((acc, r) => ({ ...acc, ...r.params }), {});

  return {
    condition: conditions.length > 0 ? conditions.join(" AND ") : null,
    params,
  };
};

export interface WhereClauseOptions {
  timeRange?: TimeRangeOptions;
  filters?: FilterDef[];
  columnFilterConfig?: ColumnFilterConfig;
  customConditions?: Array<{
    condition: string;
    params: QueryParams;
  }>;
}

export interface HavingClauseOptions {
  havingFilters?: FilterDef[];
  havingColumnFilterConfig?: ColumnFilterConfig;
  customHavingConditions?: Array<{
    condition: string;
    params: QueryParams;
  }>;
}

const buildWhereClause = (options: WhereClauseOptions): QueryResult => {
  const { timeRange, filters = [], columnFilterConfig, customConditions = [] } = options;

  const allConditions: string[] = [];
  const allParams: QueryParams = {};

  if (timeRange) {
    const timeResult = buildTimeRangeConditions(timeRange);
    if (timeResult.condition) {
      allConditions.push(timeResult.condition);
      Object.assign(allParams, timeResult.params);
    }
  }

  if (filters.length > 0 && columnFilterConfig) {
    const filterResult = buildColumnFilters(filters, columnFilterConfig);
    if (filterResult.condition) {
      allConditions.push(filterResult.condition);
      Object.assign(allParams, filterResult.params);
    }
  }

  customConditions.forEach(({ condition, params }) => {
    allConditions.push(condition);
    Object.assign(allParams, params);
  });

  return {
    query: allConditions.length > 0 ? `WHERE ${allConditions.join(" AND ")}` : "",
    parameters: allParams,
  };
};

const buildHavingClause = (options: HavingClauseOptions): QueryResult => {
  const { havingFilters = [], havingColumnFilterConfig, customHavingConditions = [] } = options;

  const allConditions: string[] = [];
  const allParams: QueryParams = {};

  if (havingFilters.length > 0 && havingColumnFilterConfig) {
    const filterResult = buildColumnFilters(havingFilters, havingColumnFilterConfig);
    if (filterResult.condition) {
      allConditions.push(filterResult.condition);
      Object.assign(allParams, filterResult.params);
    }
  }

  customHavingConditions.forEach(({ condition, params }) => {
    allConditions.push(condition);
    Object.assign(allParams, params);
  });

  return {
    query: allConditions.length > 0 ? `HAVING ${allConditions.join(" AND ")}` : "",
    parameters: allParams,
  };
};

export interface SelectQueryOptions extends WhereClauseOptions, HavingClauseOptions {
  select: SelectOptions;
  groupBy?: string[];
  orderBy?: OrderByOptions;
  pagination?: PaginationOptions;
}

const buildSelectQuery = (options: SelectQueryOptions): QueryResult => {
  const { select, groupBy, orderBy, pagination } = options;
  const whereResult = buildWhereClause(options);
  const havingResult = buildHavingClause(options);

  let query = `SELECT ${select.columns.join(", ")} FROM ${select.table}`;

  if (whereResult.query) {
    query += ` ${whereResult.query}`;
  }

  if (groupBy && groupBy.length > 0) {
    query += ` GROUP BY ${groupBy.join(", ")}`;
  }

  if (havingResult.query) {
    query += ` ${havingResult.query}`;
  }

  if (orderBy) {
    query += ` ORDER BY ${orderBy.column} ${orderBy.direction || "DESC"}`;
  }

  const allParams = { ...whereResult.parameters, ...havingResult.parameters };

  if (pagination) {
    query += ` LIMIT {limit:UInt32} OFFSET {offset:UInt32}`;
    allParams.limit = pagination.limit;
    allParams.offset = pagination.offset;
  }

  return {
    query: query.trim(),
    parameters: allParams,
  };
};

export { buildSelectQuery, createNumberFilter, createStringFilter };
