import { type Metadata } from "next";
import { redirect } from "next/navigation";

import TaskSets from "@/components/task-sets";
import { getServerSession } from "@/lib/auth-session";

export const metadata: Metadata = {
  title: "Task sets",
};

export default async function TaskSetsPage() {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in");
  }

  return <TaskSets />;
}
