import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import { getSignalRuns, GetSignalRunsSchema } from "@/lib/actions/signal-runs";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; id: string }> }
): Promise<Response> {
  const params = await props.params;
  const { projectId, id: signalId } = params;
  const parseResult = parseUrlParams(
    req.nextUrl.searchParams,
    GetSignalRunsSchema.omit({ projectId: true, signalId: true })
  );

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  try {
    const result = await getSignalRuns({ ...parseResult.data, projectId, signalId });
    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch signal runs." },
      { status: 500 }
    );
  }
}
