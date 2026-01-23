import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { createTraceAnalysisJob, getSignalJobs } from "@/lib/actions/signal-jobs";

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ projectId: string; id: string }> }
): Promise<Response> {
  const params = await props.params;
  const { projectId, id: signalId } = params;

  try {
    const result = await getSignalJobs({
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
    const result = await createTraceAnalysisJob({
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
