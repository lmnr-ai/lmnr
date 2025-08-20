import { OperatorLabelMap } from "@/components/ui/datatable-filter/utils";
import { FilterDef } from "@/lib/db/modifiers";

const normalizeSpanId = (spanId: string): string =>
  spanId.startsWith("00000000-0000-0000-") ? spanId : `00000000-0000-0000-${spanId}`;

const buildDateFilters = (
  startTime: string | null,
  endTime: string | null,
  pastHours: string | null
): { conditions: string[]; params: Record<string, string | number> } => {
  if (pastHours && !isNaN(parseFloat(pastHours))) {
    return {
      conditions: [`timestamp > now() - INTERVAL {pastHours:UInt32} HOUR`],
      params: { pastHours: parseInt(pastHours) },
    };
  }

  if (startTime) {
    const baseConditions = [`timestamp > {startTime:String}`];
    const baseParams: Record<string, string | number> = { startTime };

    if (endTime) {
      return {
        conditions: [...baseConditions, `timestamp < {endTime:String}`],
        params: { ...baseParams, endTime },
      };
    } else {
      return {
        conditions: [...baseConditions, `timestamp < now()`],
        params: baseParams,
      };
    }
  }

  return { conditions: [], params: {} };
};

const buildColumnFilter = (
  filter: FilterDef,
  paramKey: string
): { condition: string | null; param: Record<string, string | number> } => {
  const { column, operator, value } = filter;

  const opSymbol = OperatorLabelMap[operator];

  switch (column) {
    case "id":
      return { condition: `${column} ${opSymbol} {${paramKey}:String}`, param: { [paramKey]: value } };

    case "span_id":
      return { condition: `${column} ${opSymbol} {${paramKey}:String}`, param: { [paramKey]: normalizeSpanId(value) } };

    case "name":
      return {
        condition: `name ${opSymbol} {${paramKey}:String}`,
        param: { [paramKey]: value },
      };

    case "attributes":
      return {
        condition: `attributes ${opSymbol} {${paramKey}:String}`,
        param: { [paramKey]: `%${value}%` },
      };

    default:
      return { condition: null, param: {} };
  }
};

const buildWhereClause = (
  filters: FilterDef[],
  searchTerm: string | null,
  startTime: string | null,
  endTime: string | null,
  pastHours: string | null
): { whereClause: string; parameters: Record<string, string | number> } => {
  const { conditions: dateConditions, params: dateParams } = buildDateFilters(startTime, endTime, pastHours);

  const columnResults = filters
    .map((filter, index) => buildColumnFilter(filter, `filter_${index}`))
    .filter((result) => result.condition !== null);

  const columnConditions = columnResults.map(({ condition }) => condition).filter(Boolean) as string[];
  const columnParams = columnResults.reduce((acc, { param }) => ({ ...acc, ...param }), {});

  const searchConditions = searchTerm
    ? [`(name LIKE {searchTerm:String} OR attributes LIKE {searchTerm:String})`]
    : [];
  const searchParams: Record<string, string | number> = searchTerm ? { searchTerm: `%${searchTerm}%` } : {};

  const allConditions = [...dateConditions, ...columnConditions, ...searchConditions];
  const allParameters = { ...dateParams, ...columnParams, ...searchParams };

  return {
    whereClause: allConditions.length > 0 ? `WHERE ${allConditions.join(" AND ")}` : "",
    parameters: allParameters,
  };
};

const buildBaseQuery = (selectClause: string, whereClause: string, orderBy?: string): string =>
  `
  ${selectClause}
  FROM events
  ${whereClause}
  ${orderBy || ""}
`.trim();

export const buildEventsQueryWithParams = (
  filters: FilterDef[],
  searchTerm: string | null,
  startTime: string | null,
  endTime: string | null,
  pastHours: string | null,
  limit: number,
  offset: number
): { query: string; parameters: Record<string, string | number> } => {
  const { whereClause, parameters } = buildWhereClause(filters, searchTerm, startTime, endTime, pastHours);

  const selectClause = `
    SELECT 
      id,
      span_id as spanId,
      trace_id as traceId,
      timestamp,
      name,
      attributes,
      timestamp as createdAt`;

  const query = buildBaseQuery(
    selectClause,
    whereClause,
    `ORDER BY timestamp DESC
    LIMIT {limit:UInt32}
    OFFSET {offset:UInt32}`
  );

  return {
    query,
    parameters: { ...parameters, limit, offset },
  };
};

export const buildEventsCountQueryWithParams = (
  filters: FilterDef[],
  searchTerm: string | null,
  startTime: string | null,
  endTime: string | null,
  pastHours: string | null
): { query: string; parameters: Record<string, string | number> } => {
  const { whereClause, parameters } = buildWhereClause(filters, searchTerm, startTime, endTime, pastHours);

  const query = buildBaseQuery(`SELECT COUNT(*) as totalCount`, whereClause);

  return { query, parameters };
};
