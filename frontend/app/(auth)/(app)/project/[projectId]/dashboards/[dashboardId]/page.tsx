import { type Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import Dashboard from "@/components/dashboards/dashboards";
import { findChartDashboardId } from "@/lib/actions/dashboard";
import { getDashboard, getOrCreateDefaultDashboard } from "@/lib/actions/dashboard/dashboards";

export const metadata: Metadata = {
  title: "Dashboards",
};

export default async function DashboardPage(props: { params: Promise<{ projectId: string; dashboardId: string }> }) {
  const { projectId, dashboardId } = await props.params;

  const dashboard = await getDashboard({ projectId, dashboardId });

  if (dashboard) {
    return <Dashboard />;
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

  notFound();
}
