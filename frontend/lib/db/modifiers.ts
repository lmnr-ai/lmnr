import { BinaryOperator, eq, gt, gte, lt, lte, ne, SQL,sql } from "drizzle-orm";

const filterOperators: Record<string, BinaryOperator> = {
  'eq': eq,
  'lt': lt,
  'gt': gt,
  'lte': lte,
  'gte': gte,
  'ne': ne,
};

const validateSqlColumnName = (column: string, allowPatterns?: RegExp[]): boolean => {
  const regex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  const patterns = (allowPatterns ?? []).concat([regex]);
  return patterns.some(pattern => pattern.test(column));
};

export type FilterDef = {
  column: string;
  operator: string;
  value: string;
  castType?: string;
}

export const filtersToSql = (
  filters: FilterDef[],
  allowPatterns?: RegExp[],
  additionalColumnDefinitions?: Record<string, SQL<any>>
): SQL[] => {
  let result = [];
  for (const filter of filters) {
    if (filter.column && filter.operator && filter.value != null) {
      const value = filter.castType ? sql.raw(`${filter.value}::${filter.castType}`) : filter.value;
      const operator = filterOperators[filter.operator] ?? eq;
      if (additionalColumnDefinitions && filter.column in additionalColumnDefinitions) {
        result.push(operator(additionalColumnDefinitions[filter.column], value));
      } else if (validateSqlColumnName(filter.column, allowPatterns)) {
        result.push(operator(sql.raw(filter.column), value));
      }
    }
  }

  return result;
};
