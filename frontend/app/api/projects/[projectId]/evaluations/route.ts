import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

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

export async function DELETE(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;

  const body = await req.json();

  try {
    await deleteEvaluations({ projectId, ...body });
    return new Response("Evaluations deleted successfully", { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return new Response(error instanceof Error ? error.message : "Error deleting evaluations.", { status: 500 });
  }
}
