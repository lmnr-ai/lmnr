import { type NextRequest } from "next/server";
import { prettifyError, z } from "zod/v4";

import { FiltersSchema } from "@/lib/actions/common/types";
import { parseUrlParams } from "@/lib/actions/common/utils";
import { getSharedEvaluationStatistics } from "@/lib/actions/shared/evaluation";

const SharedEvaluationStatisticsSchema = FiltersSchema.extend({
  search: z.string().nullable().optional(),
  searchIn: z.array(z.string()).default([]),
});

export async function GET(req: NextRequest, props: { params: Promise<{ evaluationId: string }> }): Promise<Response> {
  const { evaluationId } = await props.params;

  const parseResult = parseUrlParams(req.nextUrl.searchParams, SharedEvaluationStatisticsSchema);

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  try {
    const { filter, search, searchIn } = parseResult.data;

    const result = await getSharedEvaluationStatistics({
      evaluationId,
      filters: filter ?? [],
      search,
      searchIn,
    });

    if (!result) {
      return Response.json({ error: "Evaluation not found or not public" }, { status: 404 });
    }

    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch shared evaluation statistics." },
      { status: 500 }
    );
  }
}
