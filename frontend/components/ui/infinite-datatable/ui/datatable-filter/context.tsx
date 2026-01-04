import { useSearchParams } from "next/navigation";
import {
  createContext,
  type Dispatch,
  type PropsWithChildren,
  type SetStateAction,
  useContext,
  useMemo,
  useState,
} from "react";

import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils.ts";
import { type Filter } from "@/lib/actions/common/filters";

type FiltersContextType = {
  value: Filter[];
  onChange: Dispatch<SetStateAction<Filter[]>>;
};

const FiltersContext = createContext<FiltersContextType>({
  value: [],
  onChange: () => {
    throw new Error("Cannot call onChange outside of FiltersContextProvider");
  },
});

export const useFiltersContextProvider = () => useContext<FiltersContextType>(FiltersContext);

const getFiltersFromUrl = (searchParams: URLSearchParams, columns: ColumnFilter[]): Filter[] => {
  if (columns?.length === 0) {
    return [];
  }

  const urlFilters = searchParams.getAll("filter");
  const validFilterKeys = new Set(columns.map((col) => col.key));

  return urlFilters.flatMap((filterParam) => {
    try {
      const parsed = JSON.parse(filterParam) as Filter;

      if (
        typeof parsed === "object" &&
        parsed.column &&
        parsed.operator &&
        parsed.value &&
        validFilterKeys.has(parsed.column)
      ) {
        return [parsed];
      }
      return [];
    } catch {
      return [];
    }
  });
};

const FiltersContextProvider = ({ columns, children }: PropsWithChildren<{ columns?: ColumnFilter[] }>) => {
  const searchParams = useSearchParams();

  const urlParamsFilters = useMemo(() => getFiltersFromUrl(searchParams, columns || []), [columns, searchParams]);

  const [filters, setFilters] = useState<Filter[]>(!columns ? [] : urlParamsFilters);
  const value = useMemo<FiltersContextType>(
    () => ({
      value: filters,
      onChange: setFilters,
    }),
    [filters]
  );

  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>;
};

export default FiltersContextProvider;
