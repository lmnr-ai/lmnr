import { getEvaluatorsBySpanPath } from "@/lib/actions/evaluators/span-path";
import { handleRoute,HttpError } from "@/lib/api/route-handler";

export const GET = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const { projectId } = params;
  const url = new URL(req.url);

  const spanPath = url.searchParams.get("spanPath");

  if (!spanPath) {
    throw new HttpError("Span path is required. ", 400);
  }

  const spanPathResult = JSON.parse(spanPath);

  return await getEvaluatorsBySpanPath({
    projectId,
    spanPath: spanPathResult,
  });
});
