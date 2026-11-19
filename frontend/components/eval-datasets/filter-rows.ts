import { type AdvancedSearchValue } from "@/components/common/advanced-search";
import { type Filter } from "@/lib/actions/common/filters";

const matches = (actual: string | number, { operator, value }: Filter): boolean => {
  if (typeof actual === "number") {
    const expected = Number(value);
    if (operator === "eq") return actual === expected;
    if (operator === "ne") return actual !== expected;
    if (operator === "lt") return actual < expected;
    if (operator === "lte") return actual <= expected;
    if (operator === "gt") return actual > expected;
    if (operator === "gte") return actual >= expected;
    return true;
  }
  if (operator === "eq") return actual === String(value);
  if (operator === "ne") return actual !== String(value);
  return true;
};

/**
 * Applies an `AdvancedSearch` value in the browser: free text matches `name`, and each
 * filter matches the field its column names (filters on unknown columns are ignored).
 */
export const filterRows = <T>(
  rows: T[],
  { filters, search }: AdvancedSearchValue,
  name: (row: T) => string,
  fields: Record<string, (row: T) => string | number>
): T[] => {
  const query = search.trim().toLowerCase();
  return rows.filter(
    (row) =>
      (!query || name(row).toLowerCase().includes(query)) &&
      filters.every((f) => !fields[f.column] || matches(fields[f.column](row), f))
  );
};
