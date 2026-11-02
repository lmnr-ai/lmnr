import { Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useFormContext } from "react-hook-form";
import { useSWRConfig } from "swr";

import { chartSavePayload } from "@/components/dashboards/editor/chart-save-payload";
import { useDashboardEditorStoreContext } from "@/components/dashboards/editor/dashboard-editor-store";
import { useWithTimeRange } from "@/components/dashboards/time-range";
import { type DashboardChart, getChartsUrl, getDashboardsUrl } from "@/components/dashboards/types";
import { Button } from "@/components/ui/button";
import { type QueryStructure } from "@/lib/actions/sql/types";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";

export default function SaveChartButton({ disabled }: { disabled: boolean }) {
  const { projectId, dashboardId } = useParams<{ projectId: string; dashboardId: string }>();
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { toast } = useToast();
  const withTimeRange = useWithTimeRange();
  const { getValues } = useFormContext<QueryStructure>();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { chart, mode } = useDashboardEditorStoreContext((state) => ({ chart: state.chart, mode: state.editorMode }));

  const handleSave = useCallback(async () => {
    if (disabled || !projectId || !dashboardId || !chart.name.trim() || !chart.query.trim()) return;

    setIsSaving(true);
    setSaveError(null);

    try {
      const data = chartSavePayload(chart, mode === "visual" ? getValues() : null);
      const chartsUrl = getChartsUrl(projectId, dashboardId);
      const response = await fetch(chart.id ? `${chartsUrl}/${chart.id}` : chartsUrl, {
        method: chart.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save chart");
      }
      const result: DashboardChart = await response.json();
      await mutate<DashboardChart[]>(
        chartsUrl,
        (current = []) =>
          chart.id ? current.map((item) => (item.id === result.id ? result : item)) : [result, ...current],
        { revalidate: false, populateCache: true, rollbackOnError: true }
      );
      if (!chart.id) await mutate(getDashboardsUrl(projectId));

      track("dashboards", chart.id ? "chart_updated" : "chart_created", { chart_type: chart.settings.config.type });
      toast({ title: `Successfully ${chart.id ? "updated" : "created"} chart` });
      router.push(withTimeRange(`/project/${projectId}/dashboards/${dashboardId}${chart.id ? "" : "?newChart=1"}`));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save chart");
    } finally {
      setIsSaving(false);
    }
  }, [chart, dashboardId, disabled, getValues, mode, mutate, projectId, router, toast, withTimeRange]);

  return (
    <>
      {saveError && <div className="text-sm text-destructive-text">{saveError}</div>}
      <Button
        onClick={handleSave}
        disabled={disabled || !chart.name.trim() || !chart.query.trim() || isSaving}
        className="gap-1 self-end"
      >
        {isSaving && <Loader2 className="size-3.5 animate-spin" />}
        {chart.id ? "Update" : "Save"}
      </Button>
    </>
  );
}
