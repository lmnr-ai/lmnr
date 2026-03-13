import { getEvaluationCellValue } from "@/lib/actions/evaluation";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute<{ projectId: string; evaluationId: string }, unknown>(async (req, params) => {
  const { projectId, evaluationId } = params;
  const url = new URL(req.url);

  const datapointId = url.searchParams.get("datapointId");
  const column = url.searchParams.get("column");

  if (!datapointId || !column) {
    throw new Error("datapointId and column are required");
  }

  const value = await getEvaluationCellValue({
    projectId,
    evaluationId,
    datapointId,
    column,
  });

  return { value };
});
