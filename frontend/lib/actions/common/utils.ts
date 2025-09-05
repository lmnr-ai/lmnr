import { isNil } from "lodash";
import { z } from "zod/v4";

import { DatatableFilter, Operator } from "@/components/ui/datatable-filter/utils";

export type FilterProcessor<TFilter = DatatableFilter, TResult = any> = (filter: TFilter) => TResult | TResult[] | null;

export interface FilterConfig<TFilter extends DatatableFilter = DatatableFilter, TResult = any> {
  processors?: Map<string, FilterProcessor<TFilter, TResult>>;
  defaultProcessor?: FilterProcessor<TFilter, TResult>;
}

export const processFilters = <TFilter extends DatatableFilter = DatatableFilter, TResult = any>(
  filters: TFilter[],
  config: FilterConfig<TFilter, TResult> = {}
): TResult[] => {
  const processors = config.processors || new Map();
  const defaultProcessor = config.defaultProcessor;

  return filters.flatMap((filter) => {
    const processor =
      processors.get(`${filter.column}:${filter.operator}`) ||
      processors.get(filter.column) ||
      defaultProcessor;

    if (!processor) return [];

    const result = processor(filter);
    if (isNil(result)) return [];

    return Array.isArray(result) ? result : [result];
  });
};

export const processors = <TFilter extends DatatableFilter, TResult>(
  configs: Array<{
    column: string;
    operators?: Operator[];
    process: FilterProcessor<TFilter, TResult>;
  }>
): Map<string, FilterProcessor<TFilter, TResult>> => {
  const entries = configs.flatMap(({ column, operators, process }) =>
    operators ? operators.map((op) => [`${column}:${op}`, process] as const) : [[column, process] as const]
  );

  return new Map(entries);
};

export const parseUrlParams = <T>(
  searchParams: URLSearchParams,
  schema: z.ZodSchema<T>,
  arrayParams: string[] = ["filter", "searchIn"]
) => {
  const obj = Object.fromEntries(
    Array.from(searchParams.keys()).map((key) => {
      const values = searchParams.getAll(key);
      return [key, arrayParams.includes(key) ? values : values[0]];
    })
  );

  return schema.safeParse(obj);
};

export const tryParseJson = (value: string) => {
  if (value === "" || value === undefined) return null;

  try {
    return JSON.parse(value);
  } catch (e) {
    // Parse with brackets because we stringify array using comma separator on server.
    try {
      return JSON.parse(`[${value}]`);
    } catch (e2) {
      console.log("Failed to parse JSON with brackets:", e2);
      return value;
    }
  }
};
