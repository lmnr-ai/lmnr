import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import useSWR from "swr";

import { type Dashboard, getDashboardsUrl } from "@/components/dashboards/types";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";
import { swrFetcher } from "@/lib/utils";

const readError = async (res: Response, fallback: string) =>
  (await res
    .json()
    .then((d) => d?.error)
    .catch(() => null)) ?? fallback;

export const useDashboardActions = () => {
  const { projectId, dashboardId } = useParams<{ projectId: string; dashboardId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const url = getDashboardsUrl(projectId);
  const { data: dashboards = [], isLoading, mutate } = useSWR<Dashboard[]>(url, swrFetcher);

  const current = dashboards.find((d) => d.id === dashboardId);

  // Keep the date range and grouping when moving between dashboards.
  const getDashboardHref = useCallback(
    (id: string) => {
      const query = searchParams.toString();
      return `/project/${projectId}/dashboards/${id}${query ? `?${query}` : ""}`;
    },
    [projectId, searchParams]
  );

  const createDashboard = useCallback(
    async (name: string) => {
      try {
        const res = await fetch(url, { method: "POST", body: JSON.stringify({ name }) });
        if (!res.ok) {
          toast({ variant: "destructive", title: await readError(res, "Failed to create dashboard") });
          return false;
        }
        const created: Dashboard = await res.json();
        await mutate();
        track("dashboards", "dashboard_created");
        router.push(getDashboardHref(created.id));
        return true;
      } catch {
        toast({ variant: "destructive", title: "Failed to create dashboard" });
        return false;
      }
    },
    [url, mutate, router, getDashboardHref, toast]
  );

  const renameDashboard = useCallback(
    async (id: string, name: string) => {
      try {
        const res = await fetch(`${url}/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });
        if (!res.ok) {
          toast({ variant: "destructive", title: await readError(res, "Failed to rename dashboard") });
          return false;
        }
        await mutate();
        router.refresh();
        return true;
      } catch {
        toast({ variant: "destructive", title: "Failed to rename dashboard" });
        return false;
      }
    },
    [url, mutate, router, toast]
  );

  const deleteDashboard = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`${url}/${id}`, { method: "DELETE" });
        if (!res.ok) {
          toast({ variant: "destructive", title: await readError(res, "Failed to delete dashboard") });
          return;
        }
        const remaining = await mutate();
        track("dashboards", "dashboard_deleted");
        if (id === dashboardId) {
          const next = remaining?.find((d) => d.id !== id);
          router.push(next ? getDashboardHref(next.id) : `/project/${projectId}/dashboards`);
        }
      } catch {
        toast({ variant: "destructive", title: "Failed to delete dashboard" });
      }
    },
    [url, mutate, router, projectId, dashboardId, getDashboardHref, toast]
  );

  return { dashboards, current, isLoading, getDashboardHref, createDashboard, renameDashboard, deleteDashboard };
};
