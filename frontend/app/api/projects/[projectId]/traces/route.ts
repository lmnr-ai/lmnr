import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import { deleteTraces, DeleteTracesSchema, getTraces, GetTracesSchema } from "@/lib/actions/traces";
import { checkDataRetentionAccess } from "@/lib/actions/usage/limits";

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;

  const parseResult = parseUrlParams(req.nextUrl.searchParams, GetTracesSchema.omit({ projectId: true }));

  if (!parseResult.success) {
    return Response.json({ items: [] });
  }

  const retentionError = await checkDataRetentionAccess(projectId, {
    pastHours: parseResult.data.pastHours,
    startDate: parseResult.data.startDate,
  });
  if (retentionError) {
    return retentionError;
  }

  try {
    const result = await getTraces({ ...parseResult.data, projectId });
    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch traces." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  let traceIds: unknown = req.nextUrl.searchParams.getAll("traceId");

  if (Array.isArray(traceIds) && traceIds.length === 0) {
    try {
      const body = (await req.json()) as { traceIds?: unknown };
      traceIds = body.traceIds;
    } catch {
      // Keep query-param parsing as the fallback for empty or malformed bodies.
    }
  }

  const parseResult = DeleteTracesSchema.safeParse({ projectId, traceIds });

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  try {
    await deleteTraces(parseResult.data);
    return new Response("Traces deleted successfully.", { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return new Response(error instanceof Error ? error.message : "Error deleting traces.", { status: 500 });
  }
}
