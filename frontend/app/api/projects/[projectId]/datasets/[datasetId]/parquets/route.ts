import { NextRequest, NextResponse } from "next/server";

import { getParquets, startParquetExportJob } from "@/lib/actions/dataset";

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string; datasetId: string }> }) {
  const { projectId, datasetId } = await params;

  const parquets = await getParquets(projectId, datasetId);

  return NextResponse.json(parquets);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; datasetId: string }> }
) {
  const { projectId, datasetId } = await params;

  const job = await startParquetExportJob(projectId, datasetId);

  return NextResponse.json(job);
}
