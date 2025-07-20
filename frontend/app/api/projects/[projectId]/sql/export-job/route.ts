import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db/drizzle";
import { datasets } from "@/lib/db/migrations/schema";

interface ExportJobRequestBody {
  datasetId: string;
  sqlQuery: string;
}

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ projectId: string }> }
): Promise<NextResponse> {
  const params = await props.params;
  const projectId = params.projectId;

  const body: ExportJobRequestBody = await req.json();
  const { datasetId, sqlQuery } = body;

  if (!datasetId || !sqlQuery?.trim()) {
    return NextResponse.json(
      { error: "Invalid request body. datasetId and sqlQuery are required." },
      { status: 400 }
    );
  }

  // Verify the dataset exists and belongs to the project
  const dataset = await db.query.datasets.findFirst({
    where: and(eq(datasets.id, datasetId), eq(datasets.projectId, projectId)),
  });

  if (!dataset) {
    return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
  }

  try {
    const dataExporterUrl = process.env.DATA_EXPORTER_URL;
    if (!dataExporterUrl) {
      return NextResponse.json(
        { error: "Data exporter service is not configured" },
        { status: 500 }
      );
    }

    // Make the POST call to the external data exporter service
    const exportResponse = await fetch(dataExporterUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        project_id: projectId,
        dataset_id: datasetId,
        sql_query: sqlQuery,
        config: {
          batch_size: 25000,
          max_retries: 3,
        },
      }),
    });

    if (!exportResponse.ok) {
      const errorText = await exportResponse.text();
      throw new Error(`Export service responded with ${exportResponse.status}: ${errorText}`);
    }

    const exportResult = await exportResponse.json();

    return NextResponse.json({
      success: true,
      message: "Export job started successfully",
      jobId: exportResult.jobId || null,
    });
  } catch (error) {
    console.error("Error starting export job:", error);
    return NextResponse.json(
      {
        error: "Failed to start export job",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
