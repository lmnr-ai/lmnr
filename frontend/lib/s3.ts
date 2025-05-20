// utils/s3.ts
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

const client = new S3Client({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
  },
});

const bucket = process.env.S3_TRACE_PAYLOADS_BUCKET ?? "";

export async function getS3Object(projectId: string, payloadId: string) {
  const getObjectRequest = new GetObjectCommand({
    Bucket: bucket,
    Key: `project/${projectId}/${payloadId}`,
  });

  const blob = await client.send(getObjectRequest);
  if (!blob.Body) {
    throw new Error("No body in S3 response");
  }

  const bytes = await blob.Body.transformToByteArray();
  if (!bytes) {
    throw new Error("Failed to transform S3 body to bytes");
  }

  return {
    bytes,
    contentType: blob.ContentType || getContentTypeFromFilename(payloadId),
  };
}

function getContentTypeFromFilename(filename: string): string {
  if (filename.endsWith(".png")) return "image/png";
  if (filename.endsWith(".gif")) return "image/gif";
  if (filename.endsWith(".webp")) return "image/webp";
  if (filename.endsWith(".pdf")) return "application/pdf";
  return "image/jpeg"; // default
}
