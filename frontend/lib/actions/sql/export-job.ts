import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db/drizzle";
import { datasets } from "@/lib/db/migrations/schema";

import { validateQuery } from "./validate-query";

export const CreateExportJobSchema = z.object({
  projectId: z.string(),
  datasetId: z.string(),
  sqlQuery: z.string().min(1, "SQL query is required"),
  config: z
    .object({
      batch_size: z.number().optional(),
      clickhouse_batch_size: z.number().optional(),
      max_retries: z.number().optional(),
    })
    .optional(),
});

export interface ExportJobResult {
  message: string;
  jobId: string | null;
  warnings?: string[];
}

export async function createExportJob(input: z.infer<typeof CreateExportJobSchema>): Promise<ExportJobResult> {
  const { projectId, datasetId, sqlQuery, config } = CreateExportJobSchema.parse(input);

  const dataset = await db.query.datasets.findFirst({
    where: and(eq(datasets.id, datasetId), eq(datasets.projectId, projectId)),
  });

  if (!dataset) {
    throw new Error("Dataset not found");
  }

  const dataExporterUrl = process.env.DATA_EXPORTER_URL;
  if (!dataExporterUrl) {
    throw new Error("Data exporter service is not configured");
  }

  const exportConfig = {
    batch_size: config?.batch_size ?? 1000,
    clickhouse_batch_size: config?.clickhouse_batch_size ?? 1000,
    max_retries: config?.max_retries ?? 3,
  };

  // Validate the SQL query using the same gRPC service as the Rust backend
  const validationResult = await validateQuery({
    projectId,
    query: sqlQuery,
  });

  if (!validationResult.success) {
    throw new Error(`Query validation failed: ${validationResult.error}`);
  }

  // Use the validated query from the query engine
  const validatedQuery = validationResult.validatedQuery || sqlQuery;

  const exportResponse = await fetch(dataExporterUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DATA_EXPORTER_SECRET_KEY}`,
    },
    body: JSON.stringify({
      sql: validatedQuery,
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

  return {
    message: "Export job started successfully",
    jobId: exportResult.jobId || null,
    warnings: validationResult.error ? [`Query was validated and may have been modified: ${validationResult.error}`] : undefined,
  };
}
