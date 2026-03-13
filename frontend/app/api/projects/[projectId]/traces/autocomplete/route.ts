import { getAutocompleteSuggestions } from "@/lib/actions/autocomplete";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const { searchParams } = new URL(req.url);

  const suggestions = await getAutocompleteSuggestions({
    projectId: params.projectId,
    entity: "traces",
    field: searchParams.get("field") || undefined,
  });

  return { suggestions };
});
