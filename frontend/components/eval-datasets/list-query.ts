import { useMemo } from "react";

import { useTableView } from "@/components/ui/infinite-datatable/model/table-config-store";
import { fetchApi } from "@/lib/api/fetch-api";
import { type PaginatedResponse } from "@/lib/types";

export const FETCH_SIZE = 50;

/** One page of a paginated eval datasets route, in `useInfiniteScroll`'s shape. */
export const fetchPage = async <T>(url: string, pageNumber: number, filter: string[], search: string | null) => {
  const params = new URLSearchParams({ pageNumber: String(pageNumber), pageSize: String(FETCH_SIZE) });
  filter.forEach((f) => params.append("filter", f));
  if (search) params.set("search", search);
  const { data, error } = await fetchApi<PaginatedResponse<T>>(`${url}?${params}`);
  if (error !== null) throw new Error(error);
  return { items: data.items, count: data.totalCount };
};

/** The table view's search and filters, as controls take them and as the routes take them. */
export const useListQuery = () => {
  const { effective, isLoading, setSearchAndFilters, setFilters } = useTableView();
  const value = useMemo(
    () => ({ filters: effective.filters, search: effective.search }),
    [effective.filters, effective.search]
  );
  const filter = useMemo(() => effective.filters.map((f) => JSON.stringify(f)), [effective.filters]);
  const search = effective.search.length > 0 ? effective.search : null;
  return {
    value,
    filter,
    search,
    isSearching: filter.length > 0 || search !== null,
    isViewLoading: isLoading,
    setSearchAndFilters,
    setFilters,
  };
};
