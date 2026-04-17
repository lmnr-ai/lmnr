import { useParams, useSearchParams } from "next/navigation";
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { type CategoricalChartFunc } from "recharts/types/chart/generateCategoricalChart";

import { ChartRendererCore } from "@/components/chart-builder/charts";
import { type ChartDragHandlers } from "@/components/chart-builder/charts/line-chart";
import { ChartType } from "@/components/chart-builder/types";
import { transformDataToColumns } from "@/components/chart-builder/utils";
import ChartHeader from "@/components/dashboards/chart-header";
import { useDashboardSelectionStore } from "@/components/dashboards/dashboard-selection-store";
import { useDashboardTraceStore } from "@/components/dashboards/dashboard-trace-context";
import { type DashboardChart } from "@/components/dashboards/types";
import { IconResizeHandle } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { type GroupByInterval } from "@/lib/clickhouse/modifiers";
import { convertToTimeParameters } from "@/lib/time";

interface ChartProps {
  chart: DashboardChart;
}

const Chart = ({ chart }: ChartProps) => {
  const { id, name, settings, query } = chart;
  const { projectId } = useParams();
  const searchParams = useSearchParams();
  const [data, setData] = useState<Record<string, any>[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openTrace = useDashboardTraceStore((s) => s.openTrace);
  const { startLabel, endLabel, isDragging, startDrag, updateDrag, endDrag } = useDashboardSelectionStore((s) => ({
    startLabel: s.startLabel,
    endLabel: s.endLabel,
    isDragging: s.isDragging,
    startDrag: s.startDrag,
    updateDrag: s.updateDrag,
    endDrag: s.endDrag,
  }));

  const columns = useMemo(() => transformDataToColumns(data), [data]);

  const pastHours = searchParams.get("pastHours");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const groupByInterval = searchParams.get("groupByInterval") as GroupByInterval | null;

  const timeParameters = useMemo(() => {
    if (pastHours) {
      return {
        pastHours,
        ...(groupByInterval && { groupByInterval }),
      };
    }

    if (startDate && endDate) {
      return {
        startTime: startDate,
        endTime: endDate,
        ...(groupByInterval && { groupByInterval }),
      };
    }
    return {
      pastHours: 24,
      ...(groupByInterval && { groupByInterval }),
    };
  }, [pastHours, startDate, endDate, groupByInterval]);

  const fetchData = useCallback(async () => {
    try {
      const { groupByInterval, ...rest } = timeParameters;
      const parameters = convertToTimeParameters(rest, groupByInterval);
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/projects/${projectId}/sql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          projectId,
          parameters,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to execute SQL query");
      }

      const result = await response.json();
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "An error occurred");
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, query, timeParameters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const supportsSelection = settings.config.type === ChartType.LineChart || settings.config.type === ChartType.BarChart;

  const onMouseDown: CategoricalChartFunc = useCallback(
    (e) => {
      if (e?.activeLabel) {
        startDrag(e.activeLabel);
      }
    },
    [startDrag]
  );

  const onMouseMove: CategoricalChartFunc = useCallback(
    (e) => {
      if (isDragging && e?.activeLabel) {
        updateDrag(e.activeLabel);
      }
    },
    [isDragging, updateDrag]
  );

  const onMouseUp = useCallback(() => {
    if (isDragging) {
      endDrag();
    }
  }, [isDragging, endDrag]);

  const drag: ChartDragHandlers | undefined = useMemo(
    () =>
      supportsSelection
        ? {
            onMouseDown,
            onMouseMove,
            onMouseUp,
            refArea: {
              left: startLabel ?? undefined,
              right: endLabel ?? undefined,
            },
          }
        : undefined,
    [supportsSelection, onMouseDown, onMouseMove, onMouseUp, startLabel, endLabel]
  );

  const handleBarClick = useCallback(
    (rowData: Record<string, any>) => {
      const signalId = rowData.signal_id;
      const traceId = rowData.trace_id || rowData.id;

      if (signalId) {
        window.open(`/project/${projectId}/signals/${signalId}`, "_blank");
        return;
      }

      const spanId = rowData.span_id;
      if (traceId) {
        openTrace(String(traceId), spanId ? String(spanId) : undefined);
      }
    },
    [openTrace, projectId]
  );

  return (
    <div className="flex flex-col border gap-2 rounded-lg p-4 h-full border-border relative">
      <ChartHeader name={name} id={id} projectId={projectId as string} />
      {error ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text text-muted-foreground">Error loading chart data</p>
          <p className="text-sm text-destructive">{error}</p>
        </div>
      ) : isLoading ? (
        <Skeleton className="h-full w-full" />
      ) : (
        <ChartRendererCore
          config={settings.config}
          data={data}
          columns={columns}
          onBarClick={handleBarClick}
          syncId="dashboard"
          drag={drag}
        />
      )}
      <IconResizeHandle className="size-4 absolute right-2 text-muted-foreground bottom-2" />
    </div>
  );
};

export default memo(Chart);
