import { type Metadata } from "next";
import { notFound } from "next/navigation";

import DashboardEditor from "@/components/dashboard/editor";
import { getChart } from "@/lib/actions/dashboard";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function ManageDashboardPage(props: { params: Promise<{ projectId: string; id: string }> }) {
  const params = await props.params;

  if (params.id !== "new") {
    let chart;
    try {
      chart = await getChart(params);
    } catch {
      return notFound();
    }
    return <DashboardEditor chart={chart} />;
  }

  return <DashboardEditor />;
}
