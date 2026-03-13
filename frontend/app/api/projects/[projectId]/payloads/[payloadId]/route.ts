import { type NextRequest } from "next/server";

import { downloadS3ObjectHttp } from "@/lib/s3";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; payloadId: string }> }
): Promise<Response> {
  try {
    const params = await props.params;
    const { projectId, payloadId } = params;
    const payloadType = req.nextUrl.searchParams.get("payloadType");

    const { bytes, headers } = await downloadS3ObjectHttp(projectId, payloadId, payloadType);

    return new Response(Buffer.from(bytes), { headers });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch payload" },
      { status: 500 }
    );
  }
}
