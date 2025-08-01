import { useParams, useSearchParams } from "next/navigation";
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";

import { ChartRendererCore } from "@/components/chart-builder/charts";
import { transformDataToColumns } from "@/components/chart-builder/utils";
import ChartHeader from "@/components/dashboard/chart-header";
import { DashboardChart } from "@/components/dashboard/types";
import { IconResizeHandle } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
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

  const columns = useMemo(() => transformDataToColumns(data), [data]);

  const timeParameters = useMemo(() => {
    const pastHours = searchParams.get("pastHours");
    if (pastHours) {
      return {
        pastHours,
      };
    }

    const startTime = searchParams.get("startDate");
    const endTime = searchParams.get("endDate");

    if (startTime && endTime) {
      return {
        startTime,
        endTime,
      };
    }
    return {
      pastHours: 24,
    };
  }, [searchParams]);

  const fetchData = useCallback(async () => {
    try {
      const parameters = convertToTimeParameters(timeParameters);
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
        <ChartRendererCore config={settings.config} data={data} columns={columns} />
      )}
      <IconResizeHandle className="size-4 absolute right-2 text-muted-foreground bottom-2" />
    </div>
  );
};

export default memo(Chart);
