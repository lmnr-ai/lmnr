import { NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { createEvaluator, deleteEvaluators, getEvaluators, GetEvaluatorsSchema } from "@/lib/actions/evaluators";

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  try {
    const params = await props.params;

    const { projectId } = params;

    const pageSize = req.nextUrl.searchParams.get("pageSize");
    const pageNumber = req.nextUrl.searchParams.get("pageNumber");

    const parseResult = GetEvaluatorsSchema.safeParse({
      pageNumber,
      pageSize,
      projectId,
    });

    if (!parseResult.success) {
      return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
    }
    const result = await getEvaluators(parseResult.data);

    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to get evaluators" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  try {
    const { projectId } = await props.params;

    const body = await req.json();

    const evaluator = await createEvaluator({
      ...body,
      projectId,
    });

    return Response.json(evaluator);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to  create evaluator." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  try {
    const { projectId } = await props.params;

    const evaluatorIds = req.nextUrl.searchParams.getAll("id");

    await deleteEvaluators({ evaluatorIds, projectId });

    return Response.json({ message: "Evaluators deleted successfully" });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to delete evaluators." },
      { status: 500 }
    );
  }
}
