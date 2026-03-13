import { createEvaluator, deleteEvaluators, getEvaluators, GetEvaluatorsSchema } from "@/lib/actions/evaluators";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const { projectId } = params;
  const url = new URL(req.url);

  const pageSize = url.searchParams.get("pageSize");
  const pageNumber = url.searchParams.get("pageNumber");

  const parseResult = GetEvaluatorsSchema.safeParse({
    pageNumber,
    pageSize,
    projectId,
  });

  if (!parseResult.success) {
    throw parseResult.error;
  }

  return await getEvaluators(parseResult.data);
});

export const POST = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const { projectId } = params;
  const body = await req.json();

  return await createEvaluator({
    ...body,
    projectId,
  });
});

export const DELETE = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const { projectId } = params;
  const url = new URL(req.url);

  const evaluatorIds = url.searchParams.getAll("id");

  await deleteEvaluators({ evaluatorIds, projectId });

  return { message: "Evaluators deleted successfully" };
});
