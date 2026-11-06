import { getTraceUserStats } from "@/lib/actions/trace-users";
import { apiHandler } from "@/lib/api/api-handler";

// user_id is free-form (emails, paths), so it rides in the query string rather than the path.
export const GET = apiHandler<{ projectId: string }>(async (req, ctx) => {
  const { projectId } = await ctx.params;
  const userId = req.nextUrl.searchParams.get("userId") ?? "";
  return Response.json(await getTraceUserStats({ projectId, userId }));
});
