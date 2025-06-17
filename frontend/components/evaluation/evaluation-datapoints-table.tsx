import { Row } from "@tanstack/react-table";
import { Settings as SettingsIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";

import {
  comparedComplementaryColumns,
  complementaryColumns,
  defaultColumns,
  getComparedScoreColumns,
  getScoreColumns,
} from "@/components/evaluation/columns";
import SearchEvaluationInput from "@/components/evaluation/search-evaluation-input";
import { useTraceViewNavigation } from "@/components/traces/trace-view/navigation-context";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/datatable";
import DataTableFilter, { DataTableFilterList } from "@/components/ui/datatable-filter";
import { ColumnFilter } from "@/components/ui/datatable-filter/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { EvaluationDatapointPreview, EvaluationDatapointPreviewWithCompared } from "@/lib/evaluation/types";

interface EvaluationDatapointsTableProps {
  datapointId?: string;
  data: EvaluationDatapointPreview[] | undefined;
  scores: string[];
  handleRowClick: (row: Row<EvaluationDatapointPreviewWithCompared>) => void;
}

const filters: ColumnFilter[] = [
  { key: "index", name: "Index", dataType: "number" },
  { key: "traceId", name: "Trace ID", dataType: "string" },
  { key: "startTime", name: "Start Time", dataType: "string" },
  { key: "duration", name: "Duration", dataType: "number" },
  { key: "cost", name: "Cost", dataType: "number" },
  { key: "metadata", name: "Metadata", dataType: "json" },
];

const EvaluationDatapointsTable = ({ data, scores, handleRowClick, datapointId }: EvaluationDatapointsTableProps) => {
  const searchParams = useSearchParams();

  const targetId = searchParams.get("targetId");

  const [heatmapEnabled, setHeatmapEnabled] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("evaluation-heatmap-enabled");
      return stored ? JSON.parse(stored) : false;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("evaluation-heatmap-enabled", JSON.stringify(heatmapEnabled));
    }
  }, [heatmapEnabled]);

  const columnFilters = useMemo<ColumnFilter[]>(
    () => [...filters, ...scores.map((score) => ({ key: `score:${score}`, name: score, dataType: "number" as const }))],
    [scores]
  );

  const scoreRanges = useMemo(() => {
    if (!data) return {};

    const isValidNumber = (value: unknown): value is number => typeof value === "number" && !isNaN(value);

    return scores.reduce(
      (ranges, scoreName) => {
        const allValues = data
          .flatMap((row) => [
            row.scores?.[scoreName],
            ...(targetId ? [(row as EvaluationDatapointPreviewWithCompared).comparedScores?.[scoreName]] : []),
          ])
          .filter(isValidNumber);

        return allValues.length > 0
          ? {
            ...ranges,
            [scoreName]: {
              min: Math.min(...allValues),
              max: Math.max(...allValues),
            },
          }
          : ranges;
      },
      {} as Record<string, { min: number; max: number }>
    );
  }, [data, scores, targetId]);

  const columns = useMemo(() => {
    if (targetId) {
      return [
        ...defaultColumns,
        ...comparedComplementaryColumns,
        ...getComparedScoreColumns(scores, heatmapEnabled, scoreRanges),
      ];
    }
    return [...defaultColumns, ...complementaryColumns, ...getScoreColumns(scores, heatmapEnabled, scoreRanges)];
  }, [targetId, scores, heatmapEnabled, scoreRanges]);

  const { setNavigationRefList } = useTraceViewNavigation<{ traceId: string; datapointId: string }>();

  useEffect(() => {
    setNavigationRefList((data ?? []).map((item) => ({ traceId: item.traceId, datapointId: item.id })));
  }, [setNavigationRefList, data]);

  return (
    <div className="flex-grow">
      <DataTable
        columns={columns}
        data={data}
        getRowId={(row) => row.id}
        focusedRowId={datapointId}
        paginated
        onRowClick={handleRowClick}
        childrenClassName="flex flex-col gap-2 py-2 items-start h-fit space-x-0"
      >
        <div className="flex flex-1 w-full space-x-2">
          <DataTableFilter columns={columnFilters} />
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
                <Switch checked={heatmapEnabled} onCheckedChange={setHeatmapEnabled} />
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          <SearchEvaluationInput />
        </div>
        <DataTableFilterList />
      </DataTable>
    </div>
  );
};

export default EvaluationDatapointsTable;
