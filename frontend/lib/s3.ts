import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";

const client = new S3Client({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
  },
});

export const isStorageUrl = (url: string) => {
  const storagePattern = /^\/api\/projects\/[^/]+\/payloads\/[^/]+$/;
  return storagePattern.test(url);
};

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
