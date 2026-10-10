import { type NextRequest } from "next/server";
import { prettifyError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import {
  getEvaluationDatapoints,
  GetEvaluationDatapointsSchema,
  renameEvaluation,
  RenameEvaluationSchema,
} from "@/lib/actions/evaluation";
import { updateEvaluationVisibility } from "@/lib/actions/evaluation/visibility";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string; evaluationId: string }>(async (req: NextRequest, ctx) => {
  const { projectId, evaluationId } = await ctx.params;

  // Parse URL params using the schema
  const parseResult = parseUrlParams(
    req.nextUrl.searchParams,
    GetEvaluationDatapointsSchema.omit({ evaluationId: true, projectId: true })
  );

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  try {
    // Call the action to get evaluation datapoints with all transformations
    const result = await getEvaluationDatapoints({
      ...parseResult.data,
      projectId,
      evaluationId,
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Evaluation not found") {
      return Response.json({ error: "Evaluation not found" }, { status: 404 });
    }
    throw error;
  }
});

export const PATCH = apiHandler<{ projectId: string; evaluationId: string }>(async (req, ctx) => {
  const { projectId, evaluationId } = await ctx.params;

  const body = await req.json();
  const parseResult = RenameEvaluationSchema.safeParse({
    ...body,
    projectId,
    evaluationId,
  });

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  try {
    const updated = await renameEvaluation(parseResult.data);
    return Response.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "Evaluation not found") {
      return Response.json({ error: "Evaluation not found" }, { status: 404 });
    }
    throw error;
  }
});

export const PUT = apiHandler<{ projectId: string; evaluationId: string }>(async (req, ctx) => {
  const { projectId, evaluationId } = await ctx.params;

  const body = await req.json();
  const visibility = body.visibility;

  if (visibility !== "public" && visibility !== "private") {
    return Response.json({ error: "visibility must be 'public' or 'private'" }, { status: 400 });
  }

  try {
    await updateEvaluationVisibility({ evaluationId, projectId, visibility });
    return Response.json({ visibility });
  } catch (error) {
    if (error instanceof Error && error.message === "Evaluation not found") {
      return Response.json({ error: "Evaluation not found" }, { status: 404 });
    }
    throw error;
  }
});
