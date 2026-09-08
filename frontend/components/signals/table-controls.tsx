"use client";

import AdvancedSearch from "@/components/common/advanced-search";
import { RESOURCE, signalsTableFilters } from "@/components/signals/constants";
import CreateSignalDrawer from "@/components/signals/create-signal-drawer";
import { Button } from "@/components/ui/button";
import { ColumnsMenu } from "@/components/ui/columns-menu";
import DateRangeFilter from "@/components/ui/date-range-filter";
import { type DateRangeValue } from "@/components/ui/date-range-filter/store";
import DataTableFilter from "@/components/ui/infinite-datatable/ui/datatable-filter";
import ViewsToolbar from "@/components/ui/infinite-datatable/views/views-toolbar";
import { type Filter } from "@/lib/actions/common/filters";

interface SignalsTableControlsProps {
  projectId: string;
  filters: Filter[];
  onFiltersChange: (filters: Filter[]) => void;
  searchValue: { filters: Filter[]; search: string };
  onSearchChange: (value: { filters: Filter[]; search: string }) => void;
  columnLabels: { id: string; label: string }[];
  dateRange: DateRangeValue;
  onDateRangeChange: (value: DateRangeValue) => void;
  isCreateOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
  onCreateSuccess: () => Promise<void>;
}

export function SignalsTableControls({
  projectId,
  filters: activeFilters,
  onFiltersChange,
  searchValue,
  onSearchChange,
  columnLabels,
  dateRange,
  onDateRangeChange,
  isCreateOpen,
  onCreateOpenChange,
  onCreateSuccess,
}: SignalsTableControlsProps) {
  return (
    <>
      <div className="flex flex-1 w-full h-full space-x-2 pt-1">
        <DataTableFilter columns={signalsTableFilters} filters={activeFilters} onFiltersChange={onFiltersChange} />
        <ColumnsMenu columnLabels={columnLabels} />
        <ViewsToolbar projectId={projectId} resource={RESOURCE} />
        {/* Scopes the Activity sparkline window only — not the signal list itself. */}
        <DateRangeFilter mode="state" value={dateRange} onChange={onDateRangeChange} hideAbsoluteDate />
        <div className="flex-1" />
        <CreateSignalDrawer open={isCreateOpen} setOpen={onCreateOpenChange} onSuccess={onCreateSuccess}>
          <Button icon="plus" onClick={() => onCreateOpenChange(true)}>
            Signal
          </Button>
        </CreateSignalDrawer>
      </div>
      <div className="w-full">
        <AdvancedSearch
          value={searchValue}
          onChange={onSearchChange}
          storageKey={`signals-${projectId}`}
          filters={signalsTableFilters}
          placeholder="Search by signal name..."
          className="w-full flex-1"
        />
      </div>
    </>
  );
}
