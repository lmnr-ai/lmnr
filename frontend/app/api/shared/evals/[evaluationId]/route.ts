import { z } from "zod/v4";

import { PaginationSchema, SortSchema } from "@/lib/actions/common/types";
import { parseUrlParams } from "@/lib/actions/common/utils";
import { EvalFilterSchema, type EvalQueryColumn } from "@/lib/actions/evaluation/query-builder";
import { getSharedEvaluationDatapoints } from "@/lib/actions/shared/evaluation";
import { handleRoute,HttpError } from "@/lib/api/route-handler";

const SharedEvaluationDatapointsSchema = z.object({
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
  sortSql: z.string().optional(),
});

export const GET = handleRoute<{ evaluationId: string }, unknown>(async (req, { evaluationId }) => {
  const url = new URL(req.url);
  const parseResult = parseUrlParams(url.searchParams, SharedEvaluationDatapointsSchema);

  if (!parseResult.success) {
    throw parseResult.error;
  }

  const {
    pageNumber,
    pageSize,
    filter,
    search,
    searchIn,
    sortBy,
    sortSql,
    sortDirection,
    columns: columnsJson,
  } = parseResult.data;

  let columns: EvalQueryColumn[] = [];
  if (columnsJson) {
    try {
      columns = JSON.parse(columnsJson);
    } catch {
      columns = [];
    }
  }

  const result = await getSharedEvaluationDatapoints({
    evaluationId,
    pageNumber,
    pageSize,
    filters: filter ?? [],
    search,
    searchIn,
    sortBy,
    sortSql,
    sortDirection,
    columns,
  });

  if (!result) {
    throw new HttpError("Evaluation not found or not public", 404);
  }

  return result;
});
