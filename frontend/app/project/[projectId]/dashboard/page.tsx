import { type Metadata } from "next";

import Dashboard from "@/components/dashboard/dashboard";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  return <Dashboard />;
}
