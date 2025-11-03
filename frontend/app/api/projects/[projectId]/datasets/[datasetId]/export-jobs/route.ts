import { NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getExportJob } from "@/lib/actions/dataset-export-jobs";

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ projectId: string; datasetId: string }> }
): Promise<Response> {
  const params = await props.params;
  const { projectId, datasetId } = params;

  try {
    const job = await getExportJob({ projectId, datasetId });
    return NextResponse.json(job);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch export job" },
      { status: 500 }
    );
  }
}


