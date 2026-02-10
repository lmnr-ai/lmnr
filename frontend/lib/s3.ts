import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";

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
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Check magic numbers for common file types
  if (hex.startsWith("89504e47")) return "image/png"; // PNG: 89 50 4E 47
  if (hex.startsWith("ffd8ff")) return "image/jpeg"; // JPEG: FF D8 FF
  if (hex.startsWith("47494638")) return "image/gif"; // GIF: 47 49 46 38
  if (hex.startsWith("52494646") && hex.substring(16, 24) === "57454250") return "image/webp"; // WEBP: RIFF...WEBP
  if (hex.startsWith("25504446")) return "application/pdf"; // PDF: 25 50 44 46

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

/**
 * Download a payload from the backend (which handles routing to S3 or data plane).
 * This is the preferred method for fetching payloads as it supports HYBRID mode.
 */
export const downloadPayloadFromBackend = async (
  projectId: string,
  payloadId: string,
  payloadType: string | null
): Promise<{
  bytes: Uint8Array;
  headers: Headers;
}> => {
  const backendUrl = new URL(
    `/api/v1/projects/${projectId}/payloads/${payloadId}`,
    process.env.BACKEND_URL
  );
  if (payloadType) {
    backendUrl.searchParams.set("payloadType", payloadType);
  }

  const response = await fetch(backendUrl.toString());

  if (!response.ok) {
    throw new Error(`Failed to download payload: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  const headers = new Headers();
  const contentType = response.headers.get("Content-Type");
  const contentDisposition = response.headers.get("Content-Disposition");

  if (contentType) headers.set("Content-Type", contentType);
  if (contentDisposition) headers.set("Content-Disposition", contentDisposition);

  return { bytes, headers };
};

/**
 * @deprecated Use downloadPayloadFromBackend instead for HYBRID mode support.
 * This function goes directly to S3 and won't work for data plane deployments.
 */
export const downloadS3ObjectHttp = async (
  projectId: string,
  payloadId: string,
  payloadType: string | null
): Promise<{
  bytes: Uint8Array;
  headers: Headers;
}> => {
  // Use the backend for routing support
  return downloadPayloadFromBackend(projectId, payloadId, payloadType);
};
export const urlToBase64 = async (url: string): Promise<string> => {
  try {
    // Validate URL format
    if (!url.startsWith("/api/projects/")) {
      throw new Error("Invalid URL format. Expected URL to start with /api/projects/");
    }

    // Extract projectId and payloadId from URL
    const matches = url.match(/\/api\/projects\/([^/]+)\/payloads\/([^/]+)/);
    if (!matches) {
      throw new Error("Invalid URL format");
    }

    const [, projectId, payloadId] = matches;

    // Get the image data from the backend (supports HYBRID mode)
    const { bytes, headers } = await downloadPayloadFromBackend(projectId, payloadId, "image");
    const contentType = headers.get("Content-Type") || "application/octet-stream";

    // Convert to base64
    const base64 = Buffer.from(bytes).toString("base64");
    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    throw new Error(`Failed to convert URL to base64: ${error}`);
  }
};

export const clientUrlToBase64 = async (url: string): Promise<string> => {
  try {
    // Validate URL format
    if (!url.startsWith("/api/projects/")) {
      throw new Error("Invalid URL format. Expected URL to start with /api/projects/");
    }

    // Use fetch to call the API endpoint instead of direct S3 access
    const response = await fetch(url + "?payloadType=image");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const contentType = response.headers.get("content-type") || "image/png";

    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    throw new Error(`Failed to convert URL to base64: ${error}`);
  }
};

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
