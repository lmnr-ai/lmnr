import { type NextRequest } from "next/server";
import { prettifyError, z } from "zod/v4";

import { PaginationSchema, SortSchema } from "@/lib/actions/common/types";
import { parseUrlParams } from "@/lib/actions/common/utils";
import { EvalFilterSchema, type EvalQueryColumn } from "@/lib/actions/evaluation/query-builder";
import { getSharedEvaluationDatapoints } from "@/lib/actions/shared/evaluation";

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
  sortSql: z.string().optional(),
});

export async function GET(req: NextRequest, props: { params: Promise<{ evaluationId: string }> }): Promise<Response> {
  const { evaluationId } = await props.params;

  const parseResult = parseUrlParams(req.nextUrl.searchParams, SharedEvaluationDatapointsSchema);

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  try {
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
