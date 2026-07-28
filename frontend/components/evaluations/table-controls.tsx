"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Settings as SettingsIcon } from "lucide-react";

import AdvancedSearch from "@/components/common/advanced-search";
import { Button } from "@/components/ui/button";
import { ColumnsMenu } from "@/components/ui/columns-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import DataTableFilter from "@/components/ui/infinite-datatable/ui/datatable-filter";
import ViewsToolbar from "@/components/ui/infinite-datatable/views/views-toolbar";
import { Switch } from "@/components/ui/switch";
import { type Filter } from "@/lib/actions/common/filters";
import { type Evaluation } from "@/lib/evaluation/types";

import { filters, RESOURCE } from "./constants";

interface EvaluationsTableControlsProps {
  projectId: string;
  activeFilters: Filter[];
  onFiltersChange: (filters: Filter[]) => void;
  columns: ColumnDef<Evaluation>[];
  scoreNames: string[];
  heatmapEnabled: boolean;
  onHeatmapEnabledChange: (enabled: boolean) => void;
  searchValue: { filters: Filter[]; search: string };
  onSearchChange: (value: { filters: Filter[]; search: string }) => void;
}

export function EvaluationsTableControls({
  projectId,
  activeFilters,
  onFiltersChange,
  columns,
  scoreNames,
  heatmapEnabled,
  onHeatmapEnabledChange,
  searchValue,
  onSearchChange,
}: EvaluationsTableControlsProps) {
  return (
    <>
      <div className="flex flex-1 w-full space-x-2">
        <DataTableFilter columns={filters} filters={activeFilters} onFiltersChange={onFiltersChange} />
        <ColumnsMenu
          columnLabels={columns
            .filter((column) => column.id !== "__chart_visibility")
            .map((column) => ({
              id: column.id!,
              label: typeof column.header === "string" ? column.header : column.id!,
            }))}
        />
        <ViewsToolbar projectId={projectId} resource={RESOURCE} />
        {scoreNames.length > 0 && (
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
                <Switch checked={heatmapEnabled} onCheckedChange={onHeatmapEnabledChange} />
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="w-full">
        <AdvancedSearch
          value={searchValue}
          onChange={onSearchChange}
          storageKey={`evaluations-${projectId}`}
          filters={filters}
          placeholder="Search evaluations..."
          className="w-full flex-1"
        />
      </div>
    </>
  );
}
