import { type Metadata } from "next";

import MetricAlertPage from "@/components/settings/alerts/metric-alert-page";
import { requireProjectAccess } from "@/lib/authorization";

export const metadata: Metadata = {
  title: "Alert",
};

export default async function AlertPage(props: { params: Promise<{ projectId: string; alertId: string }> }) {
  const { projectId, alertId } = await props.params;

  // Redirects to /sign-in / notFound() itself.
  await requireProjectAccess(projectId);

  return <MetricAlertPage projectId={projectId} alertId={alertId} />;
}
