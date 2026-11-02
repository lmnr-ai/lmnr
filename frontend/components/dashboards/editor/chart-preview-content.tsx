import { AlertCircle, Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useMemo } from "react";

import { ChartRendererCore } from "@/components/chart-builder/charts";
import { type ChartConfig, ChartType } from "@/components/chart-builder/types";
import { transformDataToColumns } from "@/components/chart-builder/utils";
import { useDashboardEditorStoreContext } from "@/components/dashboards/editor/dashboard-editor-store";
import { toTimeParameters, useDashboardTimeRange } from "@/components/dashboards/time-range";

interface ChartPreviewContentProps {
  config: ChartConfig | null;
  hiddenColumns?: string[];
}

/** Loading, error and rendered states of the editor preview, shared by both modes. */
export default function ChartPreviewContent({ config, hiddenColumns }: ChartPreviewContentProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const timeRange = useDashboardTimeRange();
  const { chartConfig, data, isLoading, error, tableHasMore, tableIsFetching, fetchNextTablePage, setChartConfig } =
    useDashboardEditorStoreContext((state) => ({
      chartConfig: state.chart.settings.config,
      data: state.data,
      isLoading: state.isLoading,
      error: state.error,
      tableHasMore: state.tableHasMore,
      tableIsFetching: state.tableIsFetching,
      fetchNextTablePage: state.fetchNextTablePage,
      setChartConfig: state.setChartConfig,
    }));
  const columns = useMemo(() => transformDataToColumns(data), [data]);

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center space-y-4 text-muted-foreground">
        <Loader2 className="w-10 h-10 animate-spin" />
        <div className="text-center">
          <p className="text-sm font-medium">Generating chart...</p>
          <p className="text-xs mt-1 text-muted-foreground/70">This may take a few moments</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col justify-center items-center space-y-3 text-destructive-text max-w-md">
        <AlertCircle className="w-10 h-10" />
        <div className="text-center">
          <p className="text-sm font-medium">Failed to execute query</p>
          <p className="text-xs mt-2 text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center space-y-3 text-muted-foreground">
        <p className="text-sm">Unable to render chart</p>
        <p className="text-xs text-muted-foreground/70">Please check your configuration</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <ChartRendererCore
        config={config}
        data={data}
        columns={columns}
        hiddenColumns={hiddenColumns}
        onColumnConfigChange={(tableColumnConfig) => {
          if (chartConfig.type === ChartType.Table) setChartConfig({ ...chartConfig, tableColumnConfig });
        }}
        hasMore={tableHasMore}
        isFetching={tableIsFetching}
        fetchNextPage={() => fetchNextTablePage(projectId, toTimeParameters(timeRange))}
      />
    </div>
  );
}
