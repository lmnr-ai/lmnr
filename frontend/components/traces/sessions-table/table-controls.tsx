"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { type ReactNode } from "react";

import AdvancedSearch from "@/components/common/advanced-search";
import { RealtimeToggle } from "@/components/traces/realtime-toggle";
import { REALTIME_STORAGE_KEY, RESOURCE } from "@/components/traces/sessions-table/constants";
import SessionsColumnsMenu from "@/components/traces/sessions-table/sessions-columns-menu";
import DateRangeFilter from "@/components/ui/date-range-filter";
import DataTableFilter from "@/components/ui/infinite-datatable/ui/datatable-filter";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import RefreshButton from "@/components/ui/infinite-datatable/ui/refresh-button.tsx";
import ViewsToolbar from "@/components/ui/infinite-datatable/views/views-toolbar";
import { type Filter } from "@/lib/actions/common/filters";
import { type SessionRow } from "@/lib/traces/types";

interface SessionsTableControlsProps {
  projectId: string;
  allFilters: ColumnFilter[];
  columnLabels: { id: string; label: string; onDelete?: () => void }[];
  columnDefs: ColumnDef<SessionRow>[];
  filters: Filter[];
  onFiltersChange: (filters: Filter[]) => void;
  onRefresh: () => void;
  searchValue: { filters: Filter[]; search: string };
  onSearchChange: (value: { filters: Filter[]; search: string }) => void;
  chart: ReactNode;
}

export function SessionsTableControls({
  projectId,
  allFilters,
  columnLabels,
  columnDefs,
  filters: activeFilters,
  onFiltersChange,
  onRefresh,
  searchValue,
  onSearchChange,
  chart,
}: SessionsTableControlsProps) {
  return (
    <>
      <div className="flex w-full flex-wrap gap-2">
        <DataTableFilter columns={allFilters} filters={activeFilters} onFiltersChange={onFiltersChange} />
        <SessionsColumnsMenu columnLabels={columnLabels} columnDefs={columnDefs} />
        <ViewsToolbar projectId={projectId} resource={RESOURCE} />
        <DateRangeFilter />
        <RefreshButton onClick={onRefresh} variant="outline" />
        <RealtimeToggle storageKey={REALTIME_STORAGE_KEY} />
      </div>
      <div className="w-full px-px">
        <AdvancedSearch
          value={searchValue}
          onChange={onSearchChange}
          filters={allFilters}
          placeholder="Search by session ID, duration, cost, tokens and more..."
          className="w-full flex-1"
          storageKey={`sessions-${projectId}`}
          resource="sessions"
        />
      </div>
      {chart}
    </>
  );
}
