import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { createDatapoints, CreateDatapointsSchema } from "@/lib/actions/datapoints";
import { withAudit } from "@/lib/audit";
import { db } from "@/lib/db/drizzle";
import { datasets } from "@/lib/db/migrations/schema";

// Adds SQL editor result rows to a dataset; the query that produced them was logged when it ran.
export const POST = withAudit(
  { resource: "datapoint", action: "create" },
  async (
    req: NextRequest,
    props: { params: Promise<{ projectId: string; datasetId: string }> },
    audit
  ): Promise<NextResponse> => {
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

    const created = await createDatapoints({
      projectId,
      datasetId,
      datapoints,
    });
    await audit.target(
      created.map((datapoint) => datapoint.id),
      { parent: { datasetId } }
    );

    return NextResponse.json({ success: true }, { status: 200 });
  }
);
