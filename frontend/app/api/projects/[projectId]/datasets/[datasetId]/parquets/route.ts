import { type NextRequest, NextResponse } from "next/server";

import { getParquets, startParquetExportJob } from "@/lib/actions/dataset";
import { withAudit } from "@/lib/audit";

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string; datasetId: string }> }) {
  const { projectId, datasetId } = await params;

  const parquets = await getParquets(projectId, datasetId);

  return NextResponse.json(parquets);
}

export const POST = withAudit(
  { resource: "dataset", action: "export" },
  async (req: NextRequest, { params }: { params: Promise<{ projectId: string; datasetId: string }> }) => {
    const { projectId, datasetId } = await params;

    const job = await startParquetExportJob(projectId, datasetId);

    return NextResponse.json(job);
  }
);
