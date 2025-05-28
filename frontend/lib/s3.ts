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
    contentType: blob.ContentType || inferContentTypeFromBytes(bytes) || getContentTypeFromFilename(payloadId),
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
  if (hex.startsWith('504b0304')) return 'application/zip';     // ZIP: 50 4B 03 04
  if (hex.startsWith('377abcaf271c')) return 'application/x-7z-compressed'; // 7z: 37 7A BC AF 27 1C
  if (hex.startsWith('1f8b08')) return 'application/gzip';      // GZIP: 1F 8B 08
  if (hex.startsWith('424d')) return 'image/bmp';               // BMP: 42 4D
  if (hex.startsWith('49492a00') || hex.startsWith('4d4d002a')) return 'image/tiff'; // TIFF: II*\0 or MM\0*

  // Check for text-based formats by looking at first bytes
  const firstBytes = bytes.slice(0, 100);
  const text = new TextDecoder('utf-8', { fatal: false }).decode(firstBytes);

  if (text.startsWith('<?xml') || text.startsWith('<svg')) return 'image/svg+xml';
  if (text.startsWith('{') || text.startsWith('[')) return 'application/json';
  if (text.includes('<!DOCTYPE html') || text.startsWith('<html')) return 'text/html';
  if (text.startsWith('data:')) return 'text/plain'; // Data URLs

  // Check if it's likely text content (printable ASCII characters)
  const isProbablyText = Array.from(firstBytes).every(byte =>
    (byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13
  );

  if (isProbablyText) return 'text/plain';

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
