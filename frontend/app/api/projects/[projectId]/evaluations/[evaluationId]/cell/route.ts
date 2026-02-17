import { type NextRequest } from "next/server";

import { getEvaluationCellValue } from "@/lib/actions/evaluation";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; evaluationId: string }> }
): Promise<Response> {
  const params = await props.params;
  const { projectId, evaluationId } = params;

  const datapointId = req.nextUrl.searchParams.get("datapointId");
  const column = req.nextUrl.searchParams.get("column");

  if (!datapointId || !column) {
    return Response.json({ error: "datapointId and column are required" }, { status: 400 });
  }

  try {
    const value = await getEvaluationCellValue({
      projectId,
      evaluationId,
      datapointId,
      column,
    });

    return Response.json({ value });
  } catch (error) {
    if (error instanceof Error && error.message === "Evaluation not found") {
      return Response.json({ error: "Evaluation not found" }, { status: 404 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch cell value." },
      { status: 500 }
    );
  }
}
