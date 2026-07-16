import { resolveScoreDirections } from "@/lib/actions/evaluation/score-directions";
import { getServerSession } from "@/lib/auth-session";
import { isUserMemberOfProject } from "@/lib/authorization";

// Resolve the app-wide default score directions for the given score names
// (repeated `?name=` params). Returns `{ defaults }` (name -> isHigherBetter);
// per-project overrides are applied client-side. Project-scoped only for auth.
export async function GET(req: Request, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const { projectId } = await props.params;

  const session = await getServerSession();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isUserMemberOfProject(projectId, userId))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const names = new URL(req.url).searchParams.getAll("name");
    const defaults = await resolveScoreDirections(names);
    return Response.json({ defaults });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
