import { redirect } from "next/navigation";

import { getOrCreateDefaultDashboard } from "@/lib/actions/dashboard/dashboards";

export default async function DashboardsPage(props: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId } = await props.params;
  const searchParams = await props.searchParams;

  const dashboard = await getOrCreateDefaultDashboard({ projectId });

  // Keep date range / grouping from bookmarked `/dashboards?...` links.
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    for (const v of [value ?? []].flat()) query.append(key, v);
  }
  const search = query.size > 0 ? `?${query}` : "";

  redirect(`/project/${projectId}/dashboards/${dashboard.id}${search}`);
}
