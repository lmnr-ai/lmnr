import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getClusterEventCounts, GetClusterEventCountsSchema } from "@/lib/actions/clusters";
import { parseUrlParams } from "@/lib/actions/common/utils";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; id: string }> }
): Promise<Response> {
  const { projectId, id: signalId } = await props.params;

  const parseResult = parseUrlParams(
    req.nextUrl.searchParams,
    GetClusterEventCountsSchema.omit({ projectId: true, signalId: true })
  );

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  try {
    const result = await getClusterEventCounts({ ...parseResult.data, projectId, signalId });
    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch cluster event counts." },
      { status: 500 }
    );
  }
}
