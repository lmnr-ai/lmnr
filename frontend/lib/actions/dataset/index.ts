import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import { datasetParquets, datasets } from "@/lib/db/migrations/schema";
import { getExportsMetadataByPath, streamExportDataByPath } from "@/lib/s3";

const getParquetInfo = async (projectId: string, datasetId: string) => {
  const parquets = await db.select().from(datasetParquets)
    .innerJoin(datasets, eq(datasetParquets.datasetId, datasets.id))
    .where(and(
      eq(datasets.projectId, projectId),
      eq(datasetParquets.datasetId, datasetId)
    ))
    .orderBy(asc(datasetParquets.createdAt), asc(datasetParquets.id));
  return parquets.map((parquet) => ({
    path: parquet.dataset_parquets.parquetPath,
    datasetId: parquet.dataset_parquets.datasetId,
    projectId: parquet.datasets.projectId,
    id: parquet.dataset_parquets.id,
  }));
};

export const startParquetExportJob = async (projectId: string, datasetId: string) => {
  if (!process.env.DATASET_EXPORT_WORKER_URL || !process.env.DATASET_EXPORT_SECRET_KEY) {
    throw new Error("DATASET_EXPORT_WORKER_URL or DATASET_EXPORT_SECRET_KEY is not set");
  }

  const response = await fetch(`${process.env.DATASET_EXPORT_WORKER_URL}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.DATASET_EXPORT_SECRET_KEY}`,
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
  const result = await Promise.allSettled(parquetInfo.map(async (info) => {
    const metadata = await getExportsMetadataByPath(info.path);
    return {
      path: info.path,
      fileName: info.path.split("/").pop(),
      datasetId: info.datasetId,
      projectId: info.projectId,
      size: metadata.size,
      id: info.id,
    };
  }));
  const parquets = result.filter((r) => r.status === "fulfilled").map((r) => r.value);
  return parquets;
};

export const streamParquet = async (projectId: string, datasetId: string, idx: number): Promise<{
  stream: ReadableStream<Uint8Array>;
  fileName: string;
  contentLength?: number;
}> => {
  const parquets = await getParquets(projectId, datasetId);
  const parquet = parquets[idx];
  const stream = await streamExportDataByPath(parquet.path);
  return {
    stream,
    fileName: parquet.fileName || `${idx}.parquet`,
    contentLength: parquet.size,
  };
};
