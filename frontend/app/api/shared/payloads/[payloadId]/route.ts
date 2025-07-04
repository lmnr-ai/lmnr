import { NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getSharedPayload } from "@/lib/actions/shared/payload";

export async function GET(req: NextRequest, props: { params: Promise<{ payloadId: string }> }): Promise<Response> {
  const params = await props.params;
  const { payloadId } = params;
  const payloadType = req.nextUrl.searchParams.get("payloadType");

  try {
    const { bytes, headers } = await getSharedPayload({ payloadType, payloadId });
    return new NextResponse(bytes, { headers });
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(e) }, { status: 400 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to get shared span events." },
      { status: 500 }
    );
  }
}
