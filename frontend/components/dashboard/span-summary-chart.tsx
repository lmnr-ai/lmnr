import { useParams, useSearchParams } from "next/navigation";
import React, { memo, useCallback, useEffect, useState } from "react";

import HorizontalBarChart from "@/components/chart-builder/charts/horizontal-bar-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { convertToTimeParameters } from "@/lib/time";

interface SqlSpanSummaryChartProps {
  title: string;
  projectId: string;
  query: string;
  groupByKey: string;
  className?: string;
}

const SqlSpanSummaryChart = memo<SqlSpanSummaryChartProps>(({ title, query, groupByKey, className }) => {
  const { projectId } = useParams();
  const searchParams = useSearchParams();
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const parameters = convertToTimeParameters({
        pastHours: searchParams.get("pastHours") || undefined,
        startTime: searchParams.get("startDate") || undefined,
        endTime: searchParams.get("endDate") || undefined,
      });

      setIsLoading(true);
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

      const data = await response.json();
      setData(data);
    } catch (e) {
    } finally {
      setIsLoading(false);
    }
  }, [projectId, query, searchParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData, projectId, query]);

  return (
    <div className={`flex flex-col border gap-1 rounded-lg p-4 h-full border-dashed border-border ${className || ""}`}>
      <div className="flex justify-between items-center">
        <div className="font-medium text-sm text-secondary-foreground">{title}</div>
      </div>
      {isLoading ? (
        <Skeleton className="h-full w-full" />
      ) : (
        <HorizontalBarChart x="value" y={[groupByKey]} data={data || []} />
      )}
    </div>
  );
});

SqlSpanSummaryChart.displayName = "SqlSpanSummaryChart";

export default SqlSpanSummaryChart;
