import { redirect } from "next/navigation";

import { findChartDashboardId } from "@/lib/actions/dashboard";
import { getDashboard, getOrCreateDefaultDashboard } from "@/lib/actions/dashboard/dashboards";

export default async function DashboardPage(props: { params: Promise<{ projectId: string; dashboardId: string }> }) {
  const { projectId, dashboardId } = await props.params;

  const dashboard = await getDashboard({ projectId, dashboardId });

  // The layout renders the dashboard; this page only validates the id.
  if (dashboard) {
    return null;
  }

  // Chart-editor links from before dashboards were nested: /dashboards/new and /dashboards/<chartId>.
  if (dashboardId === "new") {
    const fallback = await getOrCreateDefaultDashboard({ projectId });
    redirect(`/project/${projectId}/dashboards/${fallback.id}/charts/new`);
  }

  const chartDashboardId = await findChartDashboardId({ projectId, id: dashboardId });

  if (chartDashboardId) {
    redirect(`/project/${projectId}/dashboards/${chartDashboardId}/charts/${dashboardId}`);
  }

  // notFound() would render inside the (view) layout's dashboard shell, so land on a real dashboard instead.
  const fallback = await getOrCreateDefaultDashboard({ projectId });
  redirect(`/project/${projectId}/dashboards/${fallback.id}`);
}
