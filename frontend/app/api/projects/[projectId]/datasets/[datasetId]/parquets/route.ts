import { type NextRequest, NextResponse } from "next/server";

import { getParquets, startParquetExportJob } from "@/lib/actions/dataset";

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string; datasetId: string }> }) {
  try {
    const { projectId, datasetId } = await params;

    const parquets = await getParquets(projectId, datasetId);

    return NextResponse.json(parquets);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch parquets" },
      { status: 500 }
    );
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
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start parquet export" },
      { status: 500 }
    );
  }
}
