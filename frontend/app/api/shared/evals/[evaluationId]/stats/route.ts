import { z } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import { EvalFilterSchema } from "@/lib/actions/evaluation/query-builder";
import { getSharedEvaluationStatistics } from "@/lib/actions/shared/evaluation";
import { handleRoute } from "@/lib/api/route-handler";

const SharedEvaluationStatisticsSchema = z.object({
  filter: z
    .array(z.string())
    .default([])
    .transform((filters, ctx) =>
      filters
        .map((filter) => {
          try {
            return EvalFilterSchema.parse(JSON.parse(filter));
          } catch {
            ctx.issues.push({ code: "custom", message: `Invalid filter: ${filter}`, input: filter });
            return undefined;
          }
        })
        .filter((f): f is NonNullable<typeof f> => f !== undefined)
    ),
  search: z.string().nullable().optional(),
  searchIn: z.array(z.string()).default([]),
  columns: z.string().optional(),
});

export const GET = handleRoute<{ evaluationId: string }, unknown>(async (req, { evaluationId }) => {
  const url = new URL(req.url);
  const parseResult = parseUrlParams(url.searchParams, SharedEvaluationStatisticsSchema);

  if (!parseResult.success) {
    throw parseResult.error;
  }

  const { filter, search, searchIn, columns: columnsJson } = parseResult.data;
  const columns = columnsJson ? JSON.parse(columnsJson) : undefined;

  const result = await getSharedEvaluationStatistics({
    evaluationId,
    filters: filter ?? [],
    search,
    searchIn,
    columns,
  });

  if (!result) {
    throw new Error("Evaluation not found or not public");
  }

  return result;
});
