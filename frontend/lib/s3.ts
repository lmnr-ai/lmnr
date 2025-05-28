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
    contentType: inferContentTypeFromBytes(bytes) || getContentTypeFromFilename(payloadId),
  };
}

function inferContentTypeFromBytes(bytes: Uint8Array): string | null {
  if (bytes.length < 4) return null;

  // Convert first few bytes to hex for magic number detection
  const hex = Array.from(bytes.slice(0, 12))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Check magic numbers for common file types
  if (hex.startsWith('89504e47')) return 'image/png';           // PNG: 89 50 4E 47
  if (hex.startsWith('ffd8ff')) return 'image/jpeg';            // JPEG: FF D8 FF
  if (hex.startsWith('47494638')) return 'image/gif';           // GIF: 47 49 46 38
  if (hex.startsWith('52494646') && hex.substring(16, 24) === '57454250') return 'image/webp'; // WEBP: RIFF...WEBP
  if (hex.startsWith('25504446')) return 'application/pdf';     // PDF: 25 50 44 46

  return null;
}

function getContentTypeFromFilename(filename: string): string {
  if (filename.endsWith(".png")) return "image/png";
  if (filename.endsWith(".gif")) return "image/gif";
  if (filename.endsWith(".webp")) return "image/webp";
  if (filename.endsWith(".pdf")) return "application/pdf";
  if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream"; // safe default
}

export const downloadS3ObjectHttp = async (projectId: string, payloadId: string, payloadType: string | null): Promise<{
  bytes: Uint8Array;
  headers: Headers;
}> => {
  const { bytes, contentType } = await getS3Object(projectId, payloadId);
  const headers = new Headers();

  if (payloadType === "image") {
    headers.set("Content-Type", contentType);
    headers.set("Content-Disposition", "inline");
    return {
      bytes,
      headers,
    };
  } else if (payloadType === "raw") {
    headers.set("Content-Type", contentType);
    return {
      bytes,
      headers,
    };
  } else if (payloadId.endsWith(".pdf")) {
    headers.set("Content-Type", "application/pdf");
  } else {
    headers.set("Content-Type", "application/octet-stream");
  }

  headers.set("Content-Disposition", `attachment; filename="${payloadId}"`);

  return {
    bytes,
    headers,
  };
};
