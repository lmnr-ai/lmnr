import { and, asc, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { NotFoundError } from "@/lib/api/errors";
import { db } from "@/lib/db/drizzle";
import { datasetParquets, datasets } from "@/lib/db/migrations/schema";
import { getExportsMetadataByPath, streamExportDataByPath } from "@/lib/s3";

const UpdateDatasetSchema = z.object({
  projectId: z.guid(),
  datasetId: z.guid(),
  name: z.string().min(1, { message: "Dataset name is required" }),
});

export async function updateDataset(input: z.infer<typeof UpdateDatasetSchema>) {
  const { projectId, datasetId, name } = UpdateDatasetSchema.parse(input);

  const [result] = await db
    .update(datasets)
    .set({ name: name.trim() })
    .where(and(eq(datasets.id, datasetId), eq(datasets.projectId, projectId)))
    .returning();

  if (!result) {
    throw new Error("Dataset not found");
  }

  return result;
}

const getParquetInfo = async (projectId: string, datasetId: string) => {
  const parquets = await db
    .select()
    .from(datasetParquets)
    .where(and(eq(datasetParquets.projectId, projectId), eq(datasetParquets.datasetId, datasetId)))
    .orderBy(asc(datasetParquets.createdAt), asc(datasetParquets.id));

  return parquets.map((parquet) => ({
    path: parquet.parquetPath,
    datasetId: parquet.datasetId,
    projectId: parquet.projectId,
    id: parquet.id,
  }));
};

export const startParquetExportJob = async (
  projectId: string,
  datasetId: string
): Promise<{
  id: string;
  status: string;
  datasetId: string;
  projectId: string;
}> => {
  if (!process.env.DATASET_EXPORT_WORKER_URL || !process.env.DATASET_EXPORT_SECRET_KEY) {
    throw new Error("DATASET_EXPORT_WORKER_URL or DATASET_EXPORT_SECRET_KEY is not set");
  }

  const response = await fetch(`${process.env.DATASET_EXPORT_WORKER_URL}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DATASET_EXPORT_SECRET_KEY}`,
    },
    body: JSON.stringify({ projectId, datasetId }),
  });
  if (!response.ok) {
    throw new Error("Failed to start export job");
  }
  return response.json();
};

export const getParquets = async (projectId: string, datasetId: string) => {
  const parquetInfo = await getParquetInfo(projectId, datasetId);
  // Both routes use positional indexes, so dropping a failed lookup changes which file an index selects.
  return Promise.all(
    parquetInfo.map(async (info) => {
      const metadata = await getExportsMetadataByPath(info.path);
      return {
        path: info.path,
        fileName: info.path.split("/").pop(),
        datasetId: info.datasetId,
        projectId: info.projectId,
        size: metadata.size,
        id: info.id,
      };
    })
  );
};

export const streamParquet = async (
  projectId: string,
  datasetId: string,
  idx: number
): Promise<{
  stream: ReadableStream<Uint8Array>;
  fileName: string;
  contentLength?: number;
}> => {
  const parquets = await getParquets(projectId, datasetId);
  const parquet = parquets[idx];
  if (!parquet) {
    throw new NotFoundError("Parquet file not found");
  }
  const stream = await streamExportDataByPath(parquet.path);
  return {
    stream,
    fileName: parquet.fileName || `${idx}.parquet`,
    contentLength: parquet.size,
  };
};
