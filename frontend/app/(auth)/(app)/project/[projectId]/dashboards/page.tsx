import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getDashboard, getOrCreateDefaultDashboard } from "@/lib/actions/dashboard/dashboards";
import { LAST_DASHBOARD_ID } from "@/lib/cookies";

export default async function DashboardsPage(props: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId } = await props.params;
  const searchParams = await props.searchParams;

  // The last-visited dashboard may have been deleted since; fall back to the default.
  const lastDashboardId = (await cookies()).get(LAST_DASHBOARD_ID)?.value;
  const dashboard =
    (lastDashboardId && (await getDashboard({ projectId, dashboardId: lastDashboardId }))) ||
    (await getOrCreateDefaultDashboard({ projectId }));

  // Keep date range / grouping from bookmarked `/dashboards?...` links.
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    for (const v of [value ?? []].flat()) query.append(key, v);
  }
  const search = query.size > 0 ? `?${query}` : "";

  redirect(`/project/${projectId}/dashboards/${dashboard.id}${search}`);
}
