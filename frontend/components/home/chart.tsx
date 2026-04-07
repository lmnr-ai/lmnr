import { useParams, useSearchParams } from "next/navigation";
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";

import { ChartRendererCore } from "@/components/chart-builder/charts";
import { ChartType } from "@/components/chart-builder/types";
import { transformDataToColumns } from "@/components/chart-builder/utils";
import ChartHeader from "@/components/home/chart-header";
import { useHomeTraceStore } from "@/components/home/home-trace-context";
import { type HomeChart } from "@/components/home/types";
import { IconResizeHandle } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { type GroupByInterval } from "@/lib/clickhouse/modifiers";
import { convertToTimeParameters } from "@/lib/time";

/**
 * For clickable chart types (horizontal bar), inject ID columns
 * into the SQL query if they're not already present. This handles charts that
 * were saved before the editor started injecting these columns.
 */
const injectIdColumns = (sql: string, chartType?: ChartType): string => {
  if (chartType !== ChartType.HorizontalBarChart) {
    return sql;
  }

  const hasGroupBy = /\bGROUP\s+BY\b/i.test(sql);
  const injections: string[] = [];

  // Only check the SELECT clause (before FROM) for existing columns
  const fromMatch = sql.match(/\bFROM\b/i);
  const selectClause = fromMatch ? sql.slice(0, fromMatch.index).toLowerCase() : sql.toLowerCase();

  if (/\bfrom\s+signal_events\b/i.test(sql)) {
    const wrap = hasGroupBy ? (col: string) => `any(${col})` : (col: string) => col;
    if (!selectClause.includes("trace_id")) {
      injections.push(`${wrap("trace_id")} AS trace_id`);
    }
    if (!selectClause.includes("signal_id")) {
      injections.push(`${wrap("signal_id")} AS signal_id`);
    }
  } else if (!hasGroupBy) {
    if (/\bfrom\s+spans\b/i.test(sql)) {
      if (!selectClause.includes("trace_id")) {
        injections.push("trace_id");
      }
      if (!selectClause.includes("span_id")) {
        injections.push("span_id");
      }
    } else if (/\bfrom\s+traces\b/i.test(sql)) {
      if (!/\bid\b/.test(selectClause)) {
        injections.push("id");
      }
    }
  }

  if (injections.length === 0) return sql;

  return sql.replace(/\bFROM\b/i, `, ${injections.join(", ")}\nFROM`);
};

interface ChartProps {
  chart: HomeChart;
}

const Chart = ({ chart }: ChartProps) => {
  const { id, name, settings, query } = chart;
  const { projectId } = useParams();
  const searchParams = useSearchParams();
  const [data, setData] = useState<Record<string, any>[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openTrace = useHomeTraceStore((s) => s.openTrace);

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

      const augmentedQuery = injectIdColumns(query, settings.config.type);
      const response = await fetch(`/api/projects/${projectId}/sql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: augmentedQuery,
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
    <div className="flex flex-col border gap-2 rounded-lg p-4 h-full border-dashed border-border relative">
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
        />
      )}
      <IconResizeHandle className="size-4 absolute right-2 text-muted-foreground bottom-2" />
    </div>
  );
};

export default memo(Chart);
