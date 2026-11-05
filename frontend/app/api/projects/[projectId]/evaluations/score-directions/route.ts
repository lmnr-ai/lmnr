import { resolveScoreDirections } from "@/lib/actions/evaluation/score-directions";
import { apiHandler } from "@/lib/api/api-handler";

// Resolve the app-wide default score directions for the given score names
// (repeated `?name=` params) on the project's model route. Returns `{ defaults }` (name -> isHigherBetter);
// per-project overrides are applied client-side. Auth + project membership are
// enforced upstream by proxy.ts for all /api/projects/* routes.
export const GET = apiHandler<{ projectId: string }>(async (req, props) => {
  const { projectId } = await props.params;
  const defaults = await resolveScoreDirections(req.nextUrl.searchParams.getAll("name"), projectId);
  return Response.json({ defaults });
});
