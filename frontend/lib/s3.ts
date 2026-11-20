import { type Readable } from "node:stream";

import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";

const client = new S3Client({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
  },
});

/** Eval dataset task versions, as the app-server's `S3_DATASETS_BUCKET`; null when unset (no default: bucket names are global). */
export const datasetsBucket = (): string | null => process.env.S3_DATASETS_BUCKET?.trim() || null;

/** Remote eval runs' uploads and job output, as the app-server's `S3_HOSTED_EVALS_BUCKET`; null when unset. */
export const hostedEvalsBucket = (): string | null => process.env.S3_HOSTED_EVALS_BUCKET?.trim() || null;

export const streamExportDataByPath = async (path: string): Promise<ReadableStream<Uint8Array>> => {
  const request = new GetObjectCommand({
    Bucket: process.env.S3_EXPORTS_BUCKET ?? "",
    Key: path,
  });

  const response = await client.send(request);
  if (!response.Body) {
    throw new Error("No body in S3 response");
  }

  const stream = response.Body.transformToWebStream();
  if (!stream) {
    throw new Error("Failed to transform S3 body to stream");
  }

  return stream;
};

export const getExportsMetadataByPath = async (
  path: string
): Promise<{
  size: number;
}> => {
  const request = new HeadObjectCommand({
    Bucket: process.env.S3_EXPORTS_BUCKET ?? "",
    Key: path,
  });

  const response = await client.send(request);
  if (!response.ContentType) {
    throw new Error("No content type in S3 response");
  }

  return {
    size: response.ContentLength ?? 0,
  };
};

/** An object as text, or `null` when it doesn't exist. */
export const readObjectText = async (bucket: string, key: string): Promise<string | null> => {
  try {
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return (await response.Body?.transformToString()) ?? null;
  } catch (error) {
    if (error instanceof Error && error.name === "NoSuchKey") {
      return null;
    }
    throw error;
  }
};

/** Bytes `start` to `end` (inclusive) of an object, or `null` when it doesn't exist. */
export const streamObjectRange = async (
  bucket: string,
  key: string,
  start: number,
  end: number
): Promise<Readable | null> => {
  let response;
  try {
    response = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        Range: `bytes=${start}-${end}`,
      })
    );
  } catch (error) {
    if (error instanceof Error && error.name === "NoSuchKey") {
      return null;
    }
    throw error;
  }
  if (!response.Body) {
    throw new Error("No body in S3 response");
  }
  // On Node the SDK's body is an `IncomingMessage`.
  return response.Body as Readable;
};
