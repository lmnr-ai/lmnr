import { z } from "zod/v4";

import { PaginationSchema, SortSchema } from "@/lib/actions/common/types";
import { parseUrlParams } from "@/lib/actions/common/utils";
import { EvalFilterSchema } from "@/lib/actions/evaluation/query-builder";
import { getSharedEvaluationTrials, parseColumnIds } from "@/lib/actions/shared/evaluation";
import { apiHandler } from "@/lib/api/api-handler";
import { NotFoundError } from "@/lib/api/errors";

const SharedEvaluationTrialsSchema = z.object({
  ...PaginationSchema.shape,
  ...SortSchema.shape,
  filter: z
    .array(z.string())
    .default([])
    .transform((filters, ctx) =>
      filters
        .map((filter) => {
          try {
            return EvalFilterSchema.parse(JSON.parse(filter));
          } catch (error) {
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

export const GET = apiHandler<{ evaluationId: string }>(async (req, ctx) => {
  const { evaluationId } = await ctx.params;

  const parseResult = parseUrlParams(req.nextUrl.searchParams, SharedEvaluationTrialsSchema);
  if (!parseResult.success) throw parseResult.error;

  const { pageNumber, pageSize, filter, search, searchIn, sortBy, sortDirection, columns } = parseResult.data;

  const result = await getSharedEvaluationTrials({
    evaluationId,
    pageNumber,
    pageSize,
    filters: filter ?? [],
    search,
    searchIn,
    sortBy,
    sortDirection,
    columnIds: parseColumnIds(columns),
  });

  if (!result) throw new NotFoundError("Evaluation not found or not public");

  return Response.json(result);
});
