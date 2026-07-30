import { resolveScoreDirections } from "@/lib/actions/evaluation/score-directions";

// Resolve the app-wide default score directions for the given score names
// (repeated `?name=` params). Returns `{ defaults }` (name -> isHigherBetter);
// per-project overrides are applied client-side. Auth + project membership are
// enforced upstream by proxy.ts for all /api/projects/* routes.
export async function GET(req: Request, _props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  try {
    const names = new URL(req.url).searchParams.getAll("name");
    const defaults = await resolveScoreDirections(names);
    return Response.json({ defaults });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
