import { deleteProject, updateProject, UpdateProjectSchema } from "@/lib/actions/project";
import { handlerWithAudit } from "@/lib/audit";
import { getProjectScope } from "@/lib/audit/labels";

export const POST = handlerWithAudit(
  { resource: "project", action: "update" },
  async (req: Request, props: { params: Promise<{ projectId: string }> }, audit): Promise<Response> => {
    const params = await props.params;
    const { projectId } = params;

    try {
      const { name } = await req.json();
      audit.set({ metadata: { fields: ["name"] } });
      await audit.target(projectId, { name });
      const result = UpdateProjectSchema.safeParse({ name, projectId });

      if (!result.success) {
        return new Response("Invalid request body", { status: 400 });
      }

      await updateProject({ projectId, name });

      return new Response(JSON.stringify({ message: "Project renamed successfully." }), {
        status: 200,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Internal server error";
      return new Response(
        JSON.stringify({
          error: errorMessage,
          message: "Failed to update the project",
        }),
        {
          status: 500,
        }
      );
    }
  }
);

export const DELETE = handlerWithAudit(
  { resource: "project", action: "delete" },
  async (_req: Request, props: { params: Promise<{ projectId: string }> }, audit): Promise<Response> => {
    const params = await props.params;
    const { projectId } = params;
    const scope = await getProjectScope(projectId);
    audit.set({ ...scope });
    await audit.target(projectId, { name: scope?.projectName });

    try {
      await deleteProject({ projectId });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
      });
    } catch (error) {
      console.error("Error deleting project", error);
      const errorMessage = error instanceof Error ? error.message : "Internal server error";

      return new Response(
        JSON.stringify({
          error: errorMessage,
          message: "Failed to delete the project",
        }),
        {
          status: 500,
        }
      );
    }
  }
);
