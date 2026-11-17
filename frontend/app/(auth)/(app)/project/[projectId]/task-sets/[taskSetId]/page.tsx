import { type Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import TaskSet from "@/components/task-set";
import { getTaskSet } from "@/lib/actions/task-sets";
import { NotFoundError } from "@/lib/api/errors";
import { getServerSession } from "@/lib/auth-session";

export const metadata: Metadata = {
  title: "Task set",
};

export default async function TaskSetPage(props: { params: Promise<{ projectId: string; taskSetId: string }> }) {
  const { projectId, taskSetId } = await props.params;
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in");
  }

  const taskSet = await getTaskSet(projectId, taskSetId).catch((error: unknown) => {
    if (error instanceof NotFoundError) return null;
    throw error;
  });
  if (!taskSet) {
    return notFound();
  }

  return <TaskSet projectId={projectId} initialTaskSet={taskSet} />;
}
