import { deleteProject, updateProject, UpdateProjectSchema } from "@/lib/actions/project";

export async function POST(req: Request, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const { projectId } = params;

  try {
    const { name } = await req.json();
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

export async function DELETE(_req: Request, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const { projectId } = params;

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
