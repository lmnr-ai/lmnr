import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import { db } from "@/lib/db/drizzle";
import { sharedPayloads } from "@/lib/db/migrations/schema";
import { downloadS3ObjectHttp } from "@/lib/s3";

export async function GET(req: NextRequest, props: { params: Promise<{ payloadId: string }> }): Promise<Response> {
  const params = await props.params;
  const { payloadId } = params;
  const payloadType = req.nextUrl.searchParams.get("payloadType");

  const result = await db.query.sharedPayloads.findFirst({
    where: eq(sharedPayloads.payloadId, payloadId),
    columns: {
      projectId: true,
    },
  });

  if (!result) {
    return new Response(JSON.stringify({ error: "Shared Payload Not Found" }), { status: 404 });
  }

  const { bytes, headers } = await downloadS3ObjectHttp(result.projectId, payloadId, payloadType);

  return new Response(bytes, { headers });
}
