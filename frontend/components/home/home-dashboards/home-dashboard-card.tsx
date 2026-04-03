"use client";

import { Pin, PinOff } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useState } from "react";

import { ChartRendererCore } from "@/components/chart-builder/charts";
import { type DataRow, transformDataToColumns } from "@/components/chart-builder/utils";
import { type DashboardChart } from "@/components/dashboard/types";
import { Skeleton } from "@/components/ui/skeleton";
import { type GroupByInterval } from "@/lib/clickhouse/modifiers";
import { convertToTimeParameters } from "@/lib/time";

interface HomeDashboardCardProps {
  chart: DashboardChart;
  isPinned: boolean;
  onTogglePin: () => void;
}

function HomeDashboardCard({ chart, isPinned, onTogglePin }: HomeDashboardCardProps) {
  const { projectId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<DataRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const columns = useMemo(() => transformDataToColumns(data), [data]);

  const timeParameters = useMemo(() => {
    const groupByInterval = searchParams.get("groupByInterval") as GroupByInterval | null;
    const pastHours = searchParams.get("pastHours");
    if (pastHours) {
      return { pastHours, ...(groupByInterval && { groupByInterval }) };
    }
    const startTime = searchParams.get("startDate");
    const endTime = searchParams.get("endDate");
    if (startTime && endTime) {
      return { startTime, endTime, ...(groupByInterval && { groupByInterval }) };
    }
    return { pastHours: 24, ...(groupByInterval && { groupByInterval }) };
  }, [searchParams]);

  const fetchData = useCallback(async () => {
    try {
      const { groupByInterval, ...rest } = timeParameters;
      const parameters = convertToTimeParameters(rest, groupByInterval);
      setIsLoading(true);
      setError(null);
      const response = await fetch(`/api/projects/${projectId}/sql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: chart.query, projectId, parameters }),
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
  }, [projectId, chart.query, timeParameters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div
      className="bg-secondary border border-border rounded-xl h-[269px] relative overflow-hidden flex flex-col cursor-pointer hover:border-foreground/20 transition-colors"
      onClick={() => router.push(`/project/${projectId}/dashboard`)}
    >
      <div className="flex items-center justify-between p-3">
        <span className="text-xs text-secondary-foreground truncate flex-1">{chart.name}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin();
          }}
          className={`shrink-0 ml-2 transition-colors ${isPinned ? "text-primary" : "text-muted-foreground"} hover:text-foreground`}
        >
          {isPinned ? <Pin size={16} /> : <PinOff size={16} />}
        </button>
      </div>
      <div className="flex-1 overflow-hidden p-2">
        {error ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-xs text-muted-foreground">Error loading chart</p>
          </div>
        ) : isLoading ? (
          <Skeleton className="h-full w-full" />
        ) : (
          <ChartRendererCore config={chart.settings.config} data={data} columns={columns} />
        )}
      </div>
    </div>
  );
}

export default memo(HomeDashboardCard);
