import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import SqlDashboard from "@/components/sql-dashboard/sql-dashboard";
import { authOptions } from "@/lib/auth";

export default async function SqlDashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/sign-in");
  }
  return <SqlDashboard />;
}
