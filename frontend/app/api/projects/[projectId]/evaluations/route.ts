import { deleteEvaluations, getEvaluations, GetEvaluationsSchema } from "@/lib/actions/evaluations";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const { projectId } = params;
  const url = new URL(req.url);
  const groupId = url.searchParams.get("groupId");
  const pageSize = url.searchParams.get("pageSize");
  const pageNumber = url.searchParams.get("pageNumber");
  const search = url.searchParams.get("search");
  const filter = url.searchParams.getAll("filter");

  const parseResult = GetEvaluationsSchema.parse({
    projectId,
    groupId,
    pageSize,
    pageNumber,
    search,
    filter,
  });

  return await getEvaluations(parseResult);
});

export const DELETE = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const { projectId } = params;
  const body = await req.json();

  await deleteEvaluations({ projectId, ...body });
  return { success: true };
});
