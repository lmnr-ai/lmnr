import { type PropsWithChildren } from "react";

import { DashboardPreviewsProvider } from "@/components/dashboards/dashboard-previews/previews-store";

// Lives above the dashboard page so the picker stays open when switching dashboards remounts the page.
export default function DashboardsLayout({ children }: PropsWithChildren) {
  return <DashboardPreviewsProvider>{children}</DashboardPreviewsProvider>;
}
