import { isEqual } from "lodash";

import { type Filter, FilterSchemaRelaxed } from "@/lib/actions/common/filters";

// View-managed runtime params. The form area of a view — columns are tracked
// separately in `TableConfigStore`.
export interface ViewParams {
  filters: Filter[];
  search: string;
  sortBy: string | null;
  sortDirection: "asc" | "desc" | null;
}

export const EMPTY_VIEW_PARAMS: ViewParams = {
  filters: [],
  search: "",
  sortBy: null,
  sortDirection: null,
};

// Pulls baseline params out of a stored view config. Missing fields reset to
// empty defaults so a view authored before this feature shipped behaves as
// "no filters / no search / no sort" rather than NaN-style undefined drift.
export function readParamsFromView(config: Record<string, unknown> | null | undefined): ViewParams {
  if (!config) return EMPTY_VIEW_PARAMS;
  const filtersRaw = (config.filters as unknown) ?? [];
  const filters = Array.isArray(filtersRaw)
    ? filtersRaw.flatMap<Filter>((f) => {
        const result = FilterSchemaRelaxed.safeParse(f);
        return result.success ? [result.data as Filter] : [];
      })
    : [];
  const search = typeof config.search === "string" ? config.search : "";
  const sortByRaw = typeof config.sortBy === "string" ? config.sortBy : null;
  const sortDirRaw = typeof config.sortDirection === "string" ? config.sortDirection.toLowerCase() : null;
  const sortDirection = sortDirRaw === "asc" || sortDirRaw === "desc" ? sortDirRaw : null;
  return {
    filters,
    search,
    sortBy: sortByRaw && sortByRaw.length > 0 ? sortByRaw : null,
    sortDirection,
  };
}

export function paramsEqual(a: ViewParams, b: ViewParams): boolean {
  return (
    a.search === b.search &&
    a.sortBy === b.sortBy &&
    a.sortDirection === b.sortDirection &&
    isEqual(a.filters, b.filters)
  );
}
