import { type Metadata } from "next";
import { notFound } from "next/navigation";

import DashboardEditor from "@/components/dashboards/editor";
import { getChart } from "@/lib/actions/dashboard";
import { getDashboard } from "@/lib/actions/dashboard/dashboards";

export const metadata: Metadata = {
  title: "Dashboards",
};

export default async function ManageChartPage(props: {
  params: Promise<{ projectId: string; dashboardId: string; chartId: string }>;
}) {
  const { projectId, dashboardId, chartId } = await props.params;

  const dashboard = await getDashboard({ projectId, dashboardId });

  if (!dashboard) {
    notFound();
  }

  if (chartId === "new") {
    return <DashboardEditor dashboardName={dashboard.name} />;
  }

  const chart = await getChart({ projectId, dashboardId, id: chartId }).catch(() => undefined);

  if (!chart) {
    notFound();
  }

  return <DashboardEditor chart={chart} dashboardName={dashboard.name} />;
}
