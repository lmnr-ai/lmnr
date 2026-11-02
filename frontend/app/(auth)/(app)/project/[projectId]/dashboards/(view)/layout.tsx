import { type Metadata } from "next";
import { type PropsWithChildren } from "react";

import Dashboard from "@/components/dashboards/dashboards";

export const metadata: Metadata = {
  title: "Dashboards",
};

// The shell sits above `[dashboardId]` so switching dashboards keeps the header and picker mounted.
export default function DashboardViewLayout({ children }: PropsWithChildren) {
  return (
    <>
      <Dashboard />
      {children}
    </>
  );
}
