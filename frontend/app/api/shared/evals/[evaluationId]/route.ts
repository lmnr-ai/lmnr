import { type NextRequest } from "next/server";
import { prettifyError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import { PaginationFiltersSchema } from "@/lib/actions/common/types";
import { getSharedEvaluationDatapoints } from "@/lib/actions/shared/evaluation";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ evaluationId: string }> }
): Promise<Response> {
  const { evaluationId } = await props.params;

  const parseResult = parseUrlParams(req.nextUrl.searchParams, PaginationFiltersSchema);

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  try {
    const { pageNumber, pageSize, filter } = parseResult.data;

    const result = await getSharedEvaluationDatapoints({
      evaluationId,
      pageNumber,
      pageSize,
      filters: filter ?? [],
    });

    if (!result) {
      return Response.json({ error: "Evaluation not found or not public" }, { status: 404 });
    }

    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch shared evaluation datapoints." },
      { status: 500 }
    );
  }
}
