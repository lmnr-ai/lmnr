import { parseUrlParams } from "@/lib/actions/common/utils";
import {
  getEvaluationDatapoints,
  GetEvaluationDatapointsSchema,
  renameEvaluation,
  RenameEvaluationSchema,
} from "@/lib/actions/evaluation";
import { updateEvaluationVisibility } from "@/lib/actions/evaluation/visibility";
import { handleRoute,HttpError } from "@/lib/api/route-handler";

export const GET = handleRoute<{ projectId: string; evaluationId: string }, unknown>(async (req, params) => {
  const { projectId, evaluationId } = params;
  const url = new URL(req.url);

  const parseResult = parseUrlParams(
    url.searchParams,
    GetEvaluationDatapointsSchema.omit({ evaluationId: true, projectId: true })
  );

  if (!parseResult.success) {
    throw parseResult.error;
  }

  return await getEvaluationDatapoints({
    ...parseResult.data,
    projectId,
    evaluationId,
  });
});

export const PATCH = handleRoute<{ projectId: string; evaluationId: string }, unknown>(async (req, params) => {
  const { projectId, evaluationId } = params;
  const body = await req.json();

  const parseResult = RenameEvaluationSchema.safeParse({
    ...body,
    projectId,
    evaluationId,
  });

  if (!parseResult.success) {
    throw parseResult.error;
  }

  return await renameEvaluation(parseResult.data);
});

export const PUT = handleRoute<{ projectId: string; evaluationId: string }, unknown>(async (req, params) => {
  const { projectId, evaluationId } = params;
  const body = await req.json();
  const { visibility } = body;

  if (visibility !== "public" && visibility !== "private") {
    throw new HttpError("visibility must be 'public' or 'private'", 400);
  }

  await updateEvaluationVisibility({ evaluationId, projectId, visibility });

  return { visibility };
});
