import { redirect } from "next/navigation";

import { getOrCreateDefaultDashboard } from "@/lib/actions/dashboard/dashboards";

export default async function DashboardsPage(props: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await props.params;

  const dashboard = await getOrCreateDefaultDashboard({ projectId });

  redirect(`/project/${projectId}/dashboards/${dashboard.id}`);
}
