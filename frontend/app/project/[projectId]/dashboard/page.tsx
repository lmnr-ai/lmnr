import { type Metadata } from "next";

import Dashboard from "@/components/dashboard/dashboard";

export const metadata: Metadata = {
  title: "Home",
};

export default async function DashboardPage() {
  return <Dashboard />;
}
