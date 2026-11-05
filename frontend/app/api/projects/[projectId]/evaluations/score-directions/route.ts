import { resolveScoreDirections } from "@/lib/actions/evaluation/score-directions";

// Resolve the app-wide default score directions for the given score names
// (repeated `?name=` params) on the project's model route. Returns `{ defaults }` (name -> isHigherBetter);
// per-project overrides are applied client-side. Auth + project membership are
// enforced upstream by proxy.ts for all /api/projects/* routes.
export async function GET(req: Request, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  try {
    const { projectId } = await props.params;
    const names = new URL(req.url).searchParams.getAll("name");
    const defaults = await resolveScoreDirections(names, projectId);
    return Response.json({ defaults });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
