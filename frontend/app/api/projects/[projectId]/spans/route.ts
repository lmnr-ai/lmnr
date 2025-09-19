import { NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import { deleteSpans, DeleteSpansSchema, getSpans, GetSpansSchema } from "@/lib/actions/spans";

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;

  const parseResult = parseUrlParams(req.nextUrl.searchParams, GetSpansSchema.omit({ projectId: true }));

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  try {
    const result = await getSpans({ ...parseResult.data, projectId });
    return Response.json({ items: result.items, totalCount: result.count });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Failed to fetch spans." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const spanIds = req.nextUrl.searchParams.get("spanId")?.split(",");

  if (!spanIds) {
    return Response.json({ error: "At least one Span ID is required" }, { status: 400 });
  }

  const parseResult = DeleteSpansSchema.safeParse({ projectId, spanIds });

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  try {
    await deleteSpans(parseResult.data);
    return new Response("Spans deleted successfully", { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return new Response(error instanceof Error ? error.message : "Error deleting spans", { status: 500 });
  }
}
