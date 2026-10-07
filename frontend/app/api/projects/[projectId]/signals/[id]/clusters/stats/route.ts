import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getNewClusterStats, GetNewClusterStatsSchema } from "@/lib/actions/clusters";
import { parseUrlParams } from "@/lib/actions/common/utils";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; id: string }> }
): Promise<Response> {
  const { projectId, id: signalId } = await props.params;

  const parseResult = parseUrlParams(
    req.nextUrl.searchParams,
    GetNewClusterStatsSchema.omit({ projectId: true, signalId: true })
  );

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  try {
    const result = await getNewClusterStats({ ...parseResult.data, projectId, signalId });
    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch new cluster stats." },
      { status: 500 }
    );
  }
}
