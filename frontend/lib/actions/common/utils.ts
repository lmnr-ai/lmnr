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

  private findProcessor = (filter: TFilter) =>
    this.processors.get(`${filter.column}:${filter.operator}`) ||
    this.processors.get(filter.column) ||
    this.defaultProcessor;

  private processFilter = (filter: TFilter) => {
    const processor = this.findProcessor(filter);
    return processor ? processor(filter) : null;
  };

  private flattenResults = (result: TResult | TResult[]): TResult[] => (Array.isArray(result) ? result : [result]);

  processFilters = (filters: TFilter[]) =>
    filters.reduce((acc, filter) => {
      const result = this.processFilter(filter);
      return !isNil(result) ? [...acc, ...this.flattenResults(result)] : acc;
    }, [] as TResult[]);
}

export const processors = <TFilter extends DatatableFilter, TResult>(
  configs: Array<{
    column: string;
    operators?: Operator[];
    process: FilterProcessor<TFilter, TResult>;
  }>
): Map<string, FilterProcessor<TFilter, TResult>> => {
  const map = new Map<string, FilterProcessor<TFilter, TResult>>();

  configs.forEach(({ column, operators, process }) => {
    if (operators) {
      operators.forEach((op) => map.set(`${column}:${op}`, process));
    } else {
      map.set(column, process);
    }
  });

  return map;
};

export const parseUrlParams = <T>(
  searchParams: URLSearchParams,
  schema: z.ZodSchema<T>,
  arrayParams: string[] = ["filter", "searchIn"]
) => {
  const obj: Record<string, any> = {};

  for (const key of searchParams.keys()) {
    const values = searchParams.getAll(key);
    obj[key] = arrayParams.includes(key) ? values : values[0];
  }

  return schema.safeParse(obj);
};
