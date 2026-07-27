"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Settings as SettingsIcon } from "lucide-react";
import { useParams } from "next/navigation";

import AdvancedSearch, { type AdvancedSearchValue } from "@/components/common/advanced-search";
import EvalColumnsMenu from "@/components/evaluation/eval-columns-menu";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import DataTableFilter from "@/components/ui/infinite-datatable/ui/datatable-filter";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import ViewsToolbar from "@/components/ui/infinite-datatable/views/views-toolbar";
import { Switch } from "@/components/ui/switch";
import { type Filter } from "@/lib/actions/common/filters";
import { type EvalRow } from "@/lib/evaluation/types";

interface EvaluationDatapointsChromeProps {
  columnFilters: ColumnFilter[];
  columnDefs: ColumnDef<EvalRow>[];
  visibleColumnDefs: ColumnDef<EvalRow>[];
  activeFilters: Filter[];
  onFiltersChange: (filters: Filter[]) => void;
  heatmapEnabled?: boolean;
  onHeatmapEnabledChange?: (enabled: boolean) => void;
  onDeleteCustomColumn?: (columnId: string) => void;
  searchValue: AdvancedSearchValue;
  onSearchChange: (next: AdvancedSearchValue) => void;
  viewsResource?: string;
}

export function EvaluationDatapointsChrome({
  columnFilters,
  columnDefs,
  visibleColumnDefs,
  activeFilters,
  onFiltersChange,
  heatmapEnabled,
  onHeatmapEnabledChange,
  onDeleteCustomColumn,
  searchValue,
  onSearchChange,
  viewsResource,
}: EvaluationDatapointsChromeProps) {
  const { projectId } = useParams<{ projectId: string }>();

  return (
    <>
      <div className="flex flex-1 w-full space-x-2">
        <DataTableFilter columns={columnFilters} filters={activeFilters} onFiltersChange={onFiltersChange} />
        <EvalColumnsMenu
          columnDefs={columnDefs}
          columnLabels={visibleColumnDefs.map((column) => ({
            id: column.id!,
            label: typeof column.header === "string" ? column.header : column.id!,
            ...(column.id!.startsWith("custom:") &&
              onDeleteCustomColumn && {
                onDelete: () => onDeleteCustomColumn(column.id!),
              }),
          }))}
        />
        {viewsResource && <ViewsToolbar projectId={projectId} resource={viewsResource} />}
        {onHeatmapEnabledChange && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-7 w-7" variant="outline" size="icon">
                <SettingsIcon className="h-4 w-4 text-secondary-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel className="text-xs font-medium">Settings</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="flex items-center justify-between px-2 py-2">
                <div className="flex flex-col">
                  <span className="text-xs">Scores Heatmap</span>
                  <span className="text-xs text-muted-foreground">Color-code score values</span>
                </div>
                <Switch checked={heatmapEnabled ?? false} onCheckedChange={onHeatmapEnabledChange} />
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="w-full">
        <AdvancedSearch
          value={searchValue}
          onChange={onSearchChange}
          storageKey={`evaluation-datapoints-${projectId}`}
          filters={columnFilters}
          placeholder="Search in data, targets, scores and spans..."
          className="w-full flex-1"
        />
      </div>
    </>
  );
}
