import { type NextRequest } from "next/server";
import { prettifyError, z } from "zod/v4";

import { PaginationFiltersSchema } from "@/lib/actions/common/types";
import { parseUrlParams } from "@/lib/actions/common/utils";
import { getSharedEvaluationDatapoints } from "@/lib/actions/shared/evaluation";

const SharedEvaluationDatapointsSchema = PaginationFiltersSchema.extend({
  search: z.string().nullable().optional(),
  searchIn: z.array(z.string()).default([]),
});

export async function GET(req: NextRequest, props: { params: Promise<{ evaluationId: string }> }): Promise<Response> {
  const { evaluationId } = await props.params;

  const parseResult = parseUrlParams(req.nextUrl.searchParams, SharedEvaluationDatapointsSchema);

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  try {
    const { pageNumber, pageSize, filter, search, searchIn, sortBy, sortDirection } = parseResult.data;

    const result = await getSharedEvaluationDatapoints({
      evaluationId,
      pageNumber,
      pageSize,
      filters: filter ?? [],
      search,
      searchIn,
      sortBy,
      sortDirection,
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
