import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db/drizzle";
import { datasets } from "@/lib/db/migrations/schema";
import { SQLValidator } from "@/lib/sql/transpile";

interface ExportJobRequestBody {
  datasetId: string;
  sqlQuery: string;
  config?: {
    batch_size?: number;
    clickhouse_batch_size?: number;
    max_retries?: number;
  };
}

export async function POST(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<NextResponse> {
  const params = await props.params;
  const projectId = params.projectId;

  const body: ExportJobRequestBody = await req.json();
  const { datasetId, sqlQuery, config } = body;

  if (!datasetId || !sqlQuery?.trim()) {
    return NextResponse.json({ error: "Invalid request body. datasetId and sqlQuery are required." }, { status: 400 });
  }

  // Verify the dataset exists and belongs to the project
  const dataset = await db.query.datasets.findFirst({
    where: and(eq(datasets.id, datasetId), eq(datasets.projectId, projectId)),
  });

  if (!dataset) {
    return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
  }

  // Validate and transpile the SQL query
  const validator = new SQLValidator();
  const result = validator.validateAndTranspile(sqlQuery, projectId);

  if (!result.valid || !result.sql) {
    return NextResponse.json({ error: result.error || "Invalid SQL query" }, { status: 400 });
  }

  try {
    const dataExporterUrl = process.env.DATA_EXPORTER_URL;
    if (!dataExporterUrl) {
      return NextResponse.json({ error: "Data exporter service is not configured" }, { status: 500 });
    }

    // Merge provided config with defaults
    const exportConfig = {
      batch_size: config?.batch_size ?? 1000,
      clickhouse_batch_size: config?.clickhouse_batch_size ?? 1000,
      max_retries: config?.max_retries ?? 3,
    };

    // Make the POST call to the external data exporter service
    const exportResponse = await fetch(dataExporterUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sql: result.sql,
        args: result.args,
        project_id: projectId,
        dataset_id: datasetId,
        config: exportConfig,
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
      warnings: result.warnings,
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
