import { Metadata } from "next";

import DashboardEditor from "@/components/dashboard/editor";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function ManageDashboardPage() {
  return <DashboardEditor />;
}
