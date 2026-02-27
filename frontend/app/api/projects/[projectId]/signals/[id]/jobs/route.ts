import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils.ts";
import { createSignalJob, getSignalJobs, GetSignalJobsSchema } from "@/lib/actions/signal-jobs";
import { checkSignalRunsLimit } from "@/lib/actions/usage/limits";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; id: string }> }
): Promise<Response> {
  const params = await props.params;
  const { projectId, id: signalId } = params;

  const parseResult = parseUrlParams(
    req.nextUrl.searchParams,
    GetSignalJobsSchema.omit({ projectId: true, signalId: true })
  );

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  try {
    const result = await getSignalJobs({
      ...parseResult.data,
      projectId,
      signalId,
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    if (error instanceof Error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; id: string }> }
): Promise<Response> {
  const params = await props.params;
  const { projectId, id: signalId } = params;

  try {
    const body = await req.json();
    const tracesCount = Number(body.tracesCount) || 0;

    await checkSignalRunsLimit(projectId, tracesCount);

    const result = await createSignalJob({
      ...body,
      projectId,
      signalId,
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    if (error instanceof Error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
