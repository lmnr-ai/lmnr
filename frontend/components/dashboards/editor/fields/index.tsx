import { Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useSWRConfig } from "swr";

import { ChartType, type DisplayMode, resolveDisplayMode } from "@/components/chart-builder/types";
import { useDashboardEditorStoreContext } from "@/components/dashboards/editor/dashboard-editor-store";
import { type DashboardChart } from "@/components/dashboards/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";

import ChartTypeField from "./ChartTypeField";
import ColumnsField from "./ColumnsField";
import DimensionsField from "./DimensionsField";
import FiltersField from "./FiltersField";
import LimitField from "./LimitField";
import MetricsField from "./MetricsField";
import OrderByField from "./OrderByField";
import TableSelect from "./TableSelect";

const createChartViaApi = async (projectId: string, data: { name: string; query: string; config: any }) => {
  const response = await fetch(`/api/projects/${projectId}/dashboard-charts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to create chart");
  }

  return response.json();
};

const updateChartViaApi = async (
  projectId: string,
  chartId: string,
  data: { name: string; query: string; config: any }
) => {
  const response = await fetch(`/api/projects/${projectId}/dashboard-charts/${chartId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to update chart");
  }

  return response.json();
};

interface QueryBuilderFieldsProps {
  isFormValid: boolean;
  hasChartConfig: boolean;
}

export const QueryBuilderFields = ({ isFormValid, hasChartConfig }: QueryBuilderFieldsProps) => {
  const { projectId } = useParams();
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { chart, setName, chartType, displayMode, setDisplayMode } = useDashboardEditorStoreContext((state) => ({
    chart: state.chart,
    setName: state.setName,
    chartType: state.chart.settings.config.type,
    displayMode: resolveDisplayMode(state.chart.settings.config),
    setDisplayMode: state.setDisplayMode,
  }));

  const handleSaveChart = useCallback(async () => {
    if (!hasChartConfig || !projectId || !chart.name.trim()) return;

    setIsSaving(true);
    setSaveError(null);

    try {
      const data = {
        name: chart.name,
        query: chart.query,
        config: chart.settings.config,
      };

      const id = chart?.id;

      const result = id
        ? await updateChartViaApi(String(projectId), id, data)
        : await createChartViaApi(String(projectId), data);

      await mutate<DashboardChart[]>(
        `/api/projects/${projectId}/dashboard-charts`,
        (current = []) => {
          if (id) {
            return current.map((item) => (item.id === result.id ? result : item));
          }
          return [result, ...current];
        },
        { revalidate: false, populateCache: true, rollbackOnError: true }
      );

      track("dashboards", id ? "chart_updated" : "chart_created", { chart_type: chart.settings.config?.type });
      toast({ title: `Successfully ${id ? "updated" : "created"} chart` });
      router.push(`/project/${projectId}/dashboards${chart.id ? "" : "?newChart=1"}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to save chart";
      setSaveError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  }, [chart?.id, chart.name, chart.query, chart.settings.config, hasChartConfig, mutate, projectId, router, toast]);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="grid gap-1">
        <Label className="font-semibold text-xs">Chart Name</Label>
        <Input value={chart.name} onChange={(e) => setName(e.target.value)} placeholder="Enter chart name..." />
      </div>

      <ChartTypeField />
      <TableSelect />
      {chartType === ChartType.Table ? <ColumnsField /> : <MetricsField />}
      <FiltersField />
      {chartType !== ChartType.Table && <DimensionsField />}
      {(chartType === ChartType.HorizontalBarChart || chartType === ChartType.Table) && <OrderByField />}
      {chartType !== ChartType.Table && <LimitField />}

      {chartType !== ChartType.Table && (
        <div className="grid gap-1">
          <Label className="font-semibold text-xs">Display Value</Label>
          <Select value={displayMode} onValueChange={(value) => setDisplayMode(value as DisplayMode)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="total">Total</SelectItem>
              <SelectItem value="average">Average</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {saveError && <div className="text-sm text-destructive">{saveError}</div>}
      <Button
        onClick={handleSaveChart}
        disabled={!isFormValid || !chart.name.trim() || isSaving || !hasChartConfig}
        className="gap-1 self-end"
      >
        {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {chart.id ? "Update" : "Save"}
      </Button>
    </div>
  );
};
