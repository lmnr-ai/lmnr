import { type Metadata } from "next";

import DashboardEditor from "@/components/dashboards/editor";
import { getChart } from "@/lib/actions/dashboard";

export const metadata: Metadata = {
  title: "Dashboards",
};

export default async function ManageDashboardPage(props: { params: Promise<{ projectId: string; id: string }> }) {
  const params = await props.params;

  if (params.id !== "new") {
    const chart = await getChart(params);
    return <DashboardEditor chart={chart} />;
  }

  return <DashboardEditor />;
}
