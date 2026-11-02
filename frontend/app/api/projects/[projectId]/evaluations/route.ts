import { type NextRequest } from "next/server";
import { prettifyError } from "zod/v4";

import { deleteEvaluations, getEvaluations, GetEvaluationsSchema } from "@/lib/actions/evaluations";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string }>(async (req: NextRequest, ctx) => {
  const { projectId } = await ctx.params;
  const groupId = req.nextUrl.searchParams.get("groupId");
  const pageSize = req.nextUrl.searchParams.get("pageSize");
  const pageNumber = req.nextUrl.searchParams.get("pageNumber");
  const search = req.nextUrl.searchParams.get("search");
  const filter = req.nextUrl.searchParams.getAll("filter");

  const parseResult = GetEvaluationsSchema.safeParse({
    projectId,
    groupId,
    pageSize,
    pageNumber,
    search,
    filter,
  });

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  const result = await getEvaluations(parseResult.data);

  return Response.json(result);
});

export const DELETE = apiHandler<{ projectId: string }>(async (req, ctx) => {
  const { projectId } = await ctx.params;
  const body = await req.json();
  await deleteEvaluations({ ...body, projectId });
  return new Response("Evaluations deleted successfully", { status: 200 });
});
