import { type NextRequest, NextResponse } from "next/server";

import { getParquets, startParquetExportJob } from "@/lib/actions/dataset";

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string; datasetId: string }> }) {
  try {
    const { projectId, datasetId } = await params;

    const parquets = await getParquets(projectId, datasetId);

    return NextResponse.json(parquets);
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; datasetId: string }> }
) {
  try {
    const { projectId, datasetId } = await params;

    const job = await startParquetExportJob(projectId, datasetId);

    return NextResponse.json(job);
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
