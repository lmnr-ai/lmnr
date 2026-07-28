"use client";

import { ColumnsMenu } from "@/components/ui/columns-menu";
import FilterPopover, { FilterList } from "@/components/ui/infinite-datatable/ui/datatable-filter/ui";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { type Filter } from "@/lib/actions/common/filters";

interface TriggersTableControlsProps {
  filterColumns: ColumnFilter[];
  columnLabels: { id: string; label: string }[];
  filters: Filter[];
  onAddFilter: (filter: Filter) => void;
  onRemoveFilter: (filter: Filter) => void;
}

export function TriggersTableControls({
  filterColumns,
  columnLabels,
  filters,
  onAddFilter,
  onRemoveFilter,
}: TriggersTableControlsProps) {
  return (
    <>
      <div className="flex flex-1 w-full space-x-2">
        <FilterPopover columns={filterColumns} filters={filters} onAddFilter={onAddFilter} />
        <ColumnsMenu columnLabels={columnLabels} />
      </div>
      <FilterList className="py-[3px] text-xs px-1" filters={filters} onRemoveFilter={onRemoveFilter} />
    </>
  );
}
