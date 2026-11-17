import { deleteTaskSet, getTaskSet } from "@/lib/actions/task-sets";
import { apiHandler } from "@/lib/api/api-handler";
import { handlerWithAudit } from "@/lib/audit";

/** The task set with its versions, newest first. */
export const GET = apiHandler<{ projectId: string; taskSetId: string }>(async (_req, ctx) => {
  const { projectId, taskSetId } = await ctx.params;
  return Response.json(await getTaskSet(projectId, taskSetId));
});

export const DELETE = handlerWithAudit<{ projectId: string; taskSetId: string }>(
  { resource: "task_set", action: "delete" },
  async (_req, ctx, audit) => {
    const { projectId, taskSetId } = await ctx.params;
    await audit.target(taskSetId);
    await deleteTaskSet(projectId, taskSetId);
    return Response.json({ message: "Task set deleted" });
  }
);
