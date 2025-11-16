import { isEqual } from "lodash";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { memo, PropsWithChildren, useCallback, useMemo } from "react";

import { useFiltersContextProvider } from "@/widgets/ui/infinite-datatable/ui/datatable-filter/context.tsx";
import FilterPopover, { FilterList } from "@/widgets/ui/infinite-datatable/ui/datatable-filter/ui.tsx";
import { ColumnFilter, DatatableFilter } from "@/widgets/ui/infinite-datatable/ui/datatable-filter/utils.ts";

interface FilterProps {
  columns: ColumnFilter[];
  presetFilters?: DatatableFilter[];
  className?: string;
}

const DataTableFilter = ({ columns, presetFilters, className }: FilterProps) => {
  const router = useRouter();
  const pathName = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo(
    () =>
      searchParams.getAll("filter").flatMap((f) => {
        try {
          return [JSON.parse(f) as DatatableFilter];
        } catch {
          return [];
        }
      }),
    [searchParams]
  );

  const handleAddFilter = useCallback(
    (filter: DatatableFilter) => {
      const params = new URLSearchParams(searchParams);
      params.append("filter", JSON.stringify(filter));
      params.delete("pageNumber");
      params.append("pageNumber", "0");
      router.push(`${pathName}?${params.toString()}`);
    },
    [pathName, router, searchParams]
  );

  return (
    <FilterPopover
      presetFilters={presetFilters}
      columns={columns}
      className={className}
      filters={filters}
      onAddFilter={handleAddFilter}
    />
  );
};

const PureDataTableFilterList = () => {
  const router = useRouter();
  const pathName = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo(
    () =>
      searchParams.getAll("filter").flatMap((f) => {
        try {
          return [JSON.parse(f) as DatatableFilter];
        } catch {
          return [];
        }
      }),
    [searchParams]
  );

  const handleRemoveFilter = useCallback(
    (filter: DatatableFilter) => {
      const params = new URLSearchParams(searchParams);
      const newFilters = filters.filter((f) => !isEqual(f, filter));
      params.delete("filter");
      newFilters.forEach((f) => {
        params.append(`filter`, JSON.stringify(f));
      });
      router.push(`${pathName}?${params.toString()}`);
    },
    [filters, pathName, router, searchParams]
  );

  return <FilterList filters={filters} onRemoveFilter={handleRemoveFilter} />;
};

export const PureStatefulFilter = ({
  columns,
  presetFilters: presetFilters,
  className,
  children,
}: PropsWithChildren<FilterProps>) => {
  const { value: filters, onChange } = useFiltersContextProvider();

  const handleAddFilter = useCallback(
    (filter: DatatableFilter) => {
      onChange((prev) => [...prev, filter]);
    },
    [onChange]
  );

  return (
    <FilterPopover
      presetFilters={presetFilters}
      columns={columns}
      className={className}
      filters={filters}
      onAddFilter={handleAddFilter}
    >
      {children}
    </FilterPopover>
  );
};

const PureStatefulFilterList = ({ className }: { className?: string }) => {
  const { value: filters, onChange } = useFiltersContextProvider();

  const handleRemoveFilter = useCallback(
    (filter: DatatableFilter) => {
      onChange((prev) => prev.filter((f) => !isEqual(f, filter)));
    },
    [onChange]
  );

  return <FilterList className={className} filters={filters} onRemoveFilter={handleRemoveFilter} />;
};

export const DataTableFilterList = memo(PureDataTableFilterList);
export const StatefulFilter = memo(PureStatefulFilter);
export const StatefulFilterList = memo(PureStatefulFilterList);
export default memo(DataTableFilter);
