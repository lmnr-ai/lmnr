import { isNil } from "lodash";
import { z } from "zod/v4";

import { DatatableFilter, Operator } from "@/components/ui/datatable-filter/utils";

export type FilterProcessor<TFilter = DatatableFilter, TResult = any> = (filter: TFilter) => TResult | TResult[] | null;

export interface FilterBuilderConfig<TFilter extends DatatableFilter = DatatableFilter, TResult = any> {
  processors?: Map<string, FilterProcessor<TFilter, TResult>>;
  defaultProcessor?: FilterProcessor<TFilter, TResult>;
}

export class FilterBuilder<TFilter extends DatatableFilter = DatatableFilter, TResult = any> {
  private readonly processors: Map<string, FilterProcessor<TFilter, TResult>>;
  private readonly defaultProcessor?: FilterProcessor<TFilter, TResult>;

  constructor(config: FilterBuilderConfig<TFilter, TResult> = {}) {
    this.processors = config.processors || new Map();
    this.defaultProcessor = config.defaultProcessor;
  }

  processFilters = (filters: TFilter[]): TResult[] =>
    filters.flatMap((filter) => {
      const processor =
        this.processors.get(`${filter.column}:${filter.operator}`) ||
        this.processors.get(filter.column) ||
        this.defaultProcessor;

      if (!processor) return [];

      const result = processor(filter);
      if (isNil(result)) return [];

      return Array.isArray(result) ? result : [result];
    });
}

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
