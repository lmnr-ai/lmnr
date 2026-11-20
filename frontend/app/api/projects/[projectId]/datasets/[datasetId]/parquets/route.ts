import { type NextRequest, NextResponse } from "next/server";

import { getParquets, startParquetExportJob } from "@/lib/actions/dataset";
import { apiHandler } from "@/lib/api/api-handler";
import { handlerWithAudit } from "@/lib/audit";

export const GET = apiHandler<{ projectId: string; datasetId: string }>(async (_req, { params }) => {
  const { projectId, datasetId } = await params;

  const parquets = await getParquets(projectId, datasetId);

  return NextResponse.json(parquets);
});

export const POST = handlerWithAudit(
  { resource: "dataset", action: "export" },
  async (req: NextRequest, { params }: { params: Promise<{ projectId: string; datasetId: string }> }, audit) => {
    const { projectId, datasetId } = await params;
    await audit.target(datasetId);

    const job = await startParquetExportJob(projectId, datasetId);

    return NextResponse.json(job);
  }
);
