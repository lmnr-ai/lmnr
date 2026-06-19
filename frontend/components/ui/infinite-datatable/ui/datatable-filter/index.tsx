import { memo, useCallback } from "react";

import FilterPopover from "@/components/ui/infinite-datatable/ui/datatable-filter/ui.tsx";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils.ts";
import { type Filter } from "@/lib/actions/common/filters";

import { useFilterUrlValue } from "./use-filter-url-value";

interface FilterProps {
  columns: ColumnFilter[];
  presetFilters?: Filter[];
  className?: string;
  // Controlled mode: pass both to drive filters from the caller (e.g. `useTableView`).
  filters?: Filter[];
  onFiltersChange?: (next: Filter[]) => void;
}

const DataTableFilter = ({ columns, presetFilters, className, filters, onFiltersChange }: FilterProps) => {
  const isControlled = filters !== undefined && onFiltersChange !== undefined;
  const fallback = useFilterUrlValue(isControlled);
  const effectiveFilters = filters ?? fallback.filters;
  const setFilters = onFiltersChange ?? fallback.setFilters;

  const handleAddFilter = useCallback(
    (filter: Filter) => {
      setFilters([...effectiveFilters, filter]);
    },
    [effectiveFilters, setFilters]
  );

  return (
    <FilterPopover
      presetFilters={presetFilters}
      columns={columns}
      className={className}
      filters={effectiveFilters}
      onAddFilter={handleAddFilter}
    />
  );
};

export default memo(DataTableFilter);
