import { type Metadata } from "next";

import Dashboard from "@/components/dashboards/dashboards";

export const metadata: Metadata = {
  title: "Dashboards",
};

export default async function DashboardPage() {
  return <Dashboard />;
}
