import { deleteProject, updateProject, UpdateProjectSchema } from "@/lib/actions/project";
import { handleRoute,HttpError } from "@/lib/api/route-handler";

export const POST = handleRoute<{ projectId: string }, { message: string }>(async (req, { projectId }) => {
  const { name } = await req.json();
  const result = UpdateProjectSchema.safeParse({ name, projectId });

  if (!result.success) {
    throw new HttpError("Invalid request body", 400);
  }

  await updateProject({ projectId, name });
  return { message: "Project renamed successfully." };
});

export const DELETE = handleRoute<{ projectId: string }, { success: boolean }>(async (_req, { projectId }) => {
  await deleteProject({ projectId });
  return { success: true };
});
