"use client";

import AdvancedSearch, { type AdvancedSearchValue } from "@/components/common/advanced-search";
import { ColumnsMenu } from "@/components/ui/columns-menu";
import DataTableFilter from "@/components/ui/infinite-datatable/ui/datatable-filter";
import ViewsToolbar from "@/components/ui/infinite-datatable/views/views-toolbar";
import { type Filter } from "@/lib/actions/common/filters";

import { columnLabels, RESOURCE, searchFilters } from "./constants";

interface TasksTableControlsProps {
  projectId: string;
  onFiltersChange: (filters: Filter[]) => void;
  searchValue: AdvancedSearchValue;
  onSearchChange: (value: AdvancedSearchValue) => void;
  taskCount: number | null;
}

export function TasksTableControls({
  projectId,
  onFiltersChange,
  searchValue,
  onSearchChange,
  taskCount,
}: TasksTableControlsProps) {
  return (
    <>
      <div className="flex w-full flex-1 items-center space-x-2 pt-1">
        <DataTableFilter columns={searchFilters} filters={searchValue.filters} onFiltersChange={onFiltersChange} />
        <ColumnsMenu columnLabels={columnLabels} />
        <ViewsToolbar projectId={projectId} resource={RESOURCE} />
        <div className="flex-1" />
        {taskCount !== null && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {taskCount} {taskCount === 1 ? "task" : "tasks"}
          </span>
        )}
      </div>
      <div className="w-full">
        <AdvancedSearch
          value={searchValue}
          onChange={onSearchChange}
          filters={searchFilters}
          placeholder="Search tasks by name..."
          className="w-full flex-1"
        />
      </div>
    </>
  );
}
