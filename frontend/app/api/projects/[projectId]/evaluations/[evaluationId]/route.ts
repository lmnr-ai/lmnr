import { NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import {
  getEvaluationDatapoints,
  GetEvaluationDatapointsSchema,
  renameEvaluation,
  RenameEvaluationSchema,
} from "@/lib/actions/evaluation";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; evaluationId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const evaluationId = params.evaluationId;

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
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Evaluation not found") {
      return Response.json({ error: "Evaluation not found" }, { status: 404 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch evaluation datapoints." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; evaluationId: string }> }
): Promise<Response> {
  const params = await props.params;
  const { projectId, evaluationId } = params;

  try {
    const body = await req.json();
    const parseResult = RenameEvaluationSchema.safeParse({
      ...body,
      projectId,
      evaluationId,
    });

    if (!parseResult.success) {
      return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
    }

    const updated = await renameEvaluation(parseResult.data);
    return Response.json(updated);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Evaluation not found") {
      return Response.json({ error: "Evaluation not found" }, { status: 404 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to rename evaluation." },
      { status: 500 }
    );
  }
}
