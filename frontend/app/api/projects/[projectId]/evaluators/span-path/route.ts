import { getEvaluatorsBySpanPath } from "@/lib/actions/evaluators/span-path";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const { projectId } = params;
  const url = new URL(req.url);

  const spanPath = url.searchParams.get("spanPath");

  if (!spanPath) {
    throw new Error("Span path is required. ");
  }

  const spanPathResult = JSON.parse(spanPath);

  return await getEvaluatorsBySpanPath({
    projectId,
    spanPath: spanPathResult,
  });
});
