import { FilterDef } from "@/lib/db/modifiers";

const isValidUuid = (uuid: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

const normalizeUuid = (uuid: string): string =>
  uuid.startsWith("00000000-0000-0000-") ? uuid : `00000000-0000-0000-${uuid}`;

const buildWhereClause = (
  filters: FilterDef[],
  searchTerm: string | null,
  startTime: string | null,
  endTime: string | null,
  pastHours: string | null
): { whereClause: string; parameters: Record<string, any> } => {
  const whereConditions: string[] = [];
  const parameters: Record<string, any> = {};

  // Date filter
  if (pastHours && !isNaN(parseFloat(pastHours))) {
    whereConditions.push(`timestamp > now() - INTERVAL {pastHours:UInt32} HOUR`);
    parameters.pastHours = parseInt(pastHours);
  } else if (startTime) {
    whereConditions.push(`timestamp > {startTime:String}`);
    parameters.startTime = startTime;

    if (endTime) {
      whereConditions.push(`timestamp < {endTime:String}`);
      parameters.endTime = endTime;
    } else {
      whereConditions.push(`timestamp < now()`);
    }
  }

  // Column filters
  let filterIndex = 0;
  for (const filter of filters) {
    const { column, operator, value } = filter;

    if (!["id", "name", "span_id", "attributes"].includes(column) || !["eq", "ne"].includes(operator)) {
      continue;
    }

    const paramKey = `filter_${filterIndex}`;
    const opSymbol = operator === "eq" ? "=" : "!=";

    switch (column) {
      case "id":
      case "span_id":
        const normalizedValue = normalizeUuid(value);
        if (isValidUuid(normalizedValue)) {
          whereConditions.push(`${column} ${opSymbol} {${paramKey}:String}`);
          parameters[paramKey] = normalizedValue;
        }
        break;
      case "name":
        whereConditions.push(`name ${opSymbol} {${paramKey}:String}`);
        parameters[paramKey] = value;
        break;
      case "attributes":
        const likeOp = operator === "eq" ? "LIKE" : "NOT LIKE";
        whereConditions.push(`attributes ${likeOp} {${paramKey}:String}`);
        parameters[paramKey] = `%${value}%`;
        break;
    }
    filterIndex++;
  }

  if (searchTerm) {
    whereConditions.push(`(name LIKE {searchTerm:String} OR attributes LIKE {searchTerm:String})`);
    parameters.searchTerm = `%${searchTerm}%`;
  }

  return {
    whereClause: whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "",
    parameters,
  };
};

export const buildEventsQueryWithParams = (
  filters: FilterDef[],
  searchTerm: string | null,
  startTime: string | null,
  endTime: string | null,
  pastHours: string | null,
  limit: number,
  offset: number
): { query: string; parameters: Record<string, any> } => {
  const { whereClause, parameters } = buildWhereClause(filters, searchTerm, startTime, endTime, pastHours);

  // Add pagination parameters
  parameters.limit = limit;
  parameters.offset = offset;

  const query = `
    SELECT 
      id,
      span_id as spanId,
      trace_id as traceId,
      timestamp,
      name,
      attributes,
      timestamp as createdAt
    FROM events
    ${whereClause}
    ORDER BY timestamp DESC
    LIMIT {limit:UInt32}
    OFFSET {offset:UInt32}
  `;

  return { query, parameters };
};

export const buildEventsCountQueryWithParams = (
  filters: FilterDef[],
  searchTerm: string | null,
  startTime: string | null,
  endTime: string | null,
  pastHours: string | null
): { query: string; parameters: Record<string, any> } => {
  const { whereClause, parameters } = buildWhereClause(filters, searchTerm, startTime, endTime, pastHours);

  const query = `
    SELECT COUNT(*) as totalCount
    FROM events
    ${whereClause}
  `;

  return { query, parameters };
};
