import { useParams, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import { ChartRendererCore } from "@/components/chart-builder/charts";
import { ChartConfig } from "@/components/chart-builder/types";
import { transformDataToColumns } from "@/components/chart-builder/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { convertToTimeParameters } from "@/lib/time";

interface ChartProps {
  name: string;
  config: ChartConfig;
  query: string;
}

export const Chart = ({ name, config, query }: ChartProps) => {
  const { projectId } = useParams();
  const searchParams = useSearchParams();
  const [data, setData] = useState<Record<string, any>[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const columns = useMemo(() => transformDataToColumns(data), [data]);

  const fetchData = useCallback(async () => {
    try {
      const parameters = convertToTimeParameters({
        pastHours: searchParams.get("pastHours") || undefined,
        startTime: searchParams.get("startDate") || undefined,
        endTime: searchParams.get("endDate") || undefined,
      });

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
  }, [projectId, query, searchParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (isLoading) {
    return <Skeleton className="h-full w-full" />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full w-full text-muted-foreground">
        <div className="text-center">
          <p className="text">Error loading chart data</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col border rounded-lg p-4 h-full border-dashed border-border">
      <span className="font-medium text-sm text-secondary-foreground">{name}</span>
      <ChartRendererCore config={config} data={data} columns={columns} />
    </div>
  );
};
