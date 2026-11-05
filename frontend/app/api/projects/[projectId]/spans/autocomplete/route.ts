import { getAutocompleteSuggestions } from "@/lib/actions/autocomplete";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string }>(async (req, ctx) => {
  const { projectId } = await ctx.params;

  const suggestions = await getAutocompleteSuggestions({
    projectId,
    entity: "spans",
    field: req.nextUrl.searchParams.get("field") || undefined,
  });

  return Response.json({ suggestions });
});
