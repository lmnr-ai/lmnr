import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { createDatapoints, CreateDatapointsSchema } from "@/lib/actions/datapoints";
import { db } from "@/lib/db/drizzle";
import { datasets } from "@/lib/db/migrations/schema";

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; datasetId: string }> }
): Promise<NextResponse> {
  const params = await props.params;
  const projectId = params.projectId;
  const datasetId = params.datasetId;

  const dataset = await db.query.datasets.findFirst({
    where: and(eq(datasets.id, datasetId), eq(datasets.projectId, projectId)),
  });

  if (!dataset) {
    return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
  }

  const body = await req.json();

  // Validate request body
  const parseResult = CreateDatapointsSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: "Invalid request body",
        details: parseResult.error.issues,
      },
      { status: 400 }
    );
  }
  const { datapoints } = parseResult.data;

  await createDatapoints({
    projectId,
    datasetId,
    datapoints,
  });

  return NextResponse.json({ success: true }, { status: 200 });
}
