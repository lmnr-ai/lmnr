import { NextRequest } from "next/server";

import { getS3Object } from "@/lib/s3";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; payloadId: string }> }
): Promise<Response> {
  const params = await props.params;
  const { projectId, payloadId } = params;
  const payloadType = req.nextUrl.searchParams.get("payloadType");

  const { bytes, contentType } = await getS3Object(projectId, payloadId);
  const headers = new Headers();

  if (payloadType === "image") {
    headers.set("Content-Type", contentType);
    headers.set("Content-Disposition", "inline");
    return new Response(bytes, { headers });
  } else if (payloadType === "raw") {
    headers.set("Content-Type", contentType);
    return new Response(bytes, { headers });
  } else if (payloadId.endsWith(".pdf")) {
    headers.set("Content-Type", "application/pdf");
  } else {
    headers.set("Content-Type", "application/octet-stream");
  }

  headers.set("Content-Disposition", `attachment; filename="${payloadId}"`);
  return new Response(bytes, { headers });
}
