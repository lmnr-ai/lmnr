import { useCallback } from "react";
import useSWR, { useSWRConfig } from "swr";

import { type Dashboard, type DashboardChart, getChartsUrl, getDashboardsUrl } from "@/components/dashboards/types";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";
import { swrFetcher } from "@/lib/utils";

/** Moves a chart off `dashboardId` onto another dashboard, removing it from the grid optimistically. */
export const useMoveChart = (projectId: string, dashboardId: string) => {
  const chartsUrl = getChartsUrl(projectId, dashboardId);
  const dashboardsUrl = getDashboardsUrl(projectId);
  const { data: dashboards = [] } = useSWR<Dashboard[]>(dashboardsUrl, swrFetcher);
  const { mutate } = useSWRConfig();
  const { toast } = useToast();

  const moveChart = useCallback(
    async (chartId: string, targetId: string) => {
      const withoutChart = (current?: DashboardChart[]) => (current || []).filter((item) => item.id !== chartId);
      try {
        await mutate<DashboardChart[]>(
          chartsUrl,
          async (current) => {
            const res = await fetch(`${chartsUrl}/${chartId}/move`, {
              method: "POST",
              body: JSON.stringify({ targetDashboardId: targetId }),
            });
            if (!res.ok) throw new Error("Failed to move chart");
            return withoutChart(current);
          },
          { revalidate: false, populateCache: true, rollbackOnError: true, optimisticData: withoutChart }
        );
        // Both chart counts change, and the target's cached chart list (used by its preview) is now stale.
        await Promise.all([mutate(getChartsUrl(projectId, targetId)), mutate(dashboardsUrl)]);
        track("dashboards", "chart_moved");
      } catch {
        toast({ title: "Failed to move chart. Please try again.", variant: "destructive" });
      }
    },
    [chartsUrl, dashboardsUrl, mutate, projectId, toast]
  );

  return { dashboards, moveChart };
};
