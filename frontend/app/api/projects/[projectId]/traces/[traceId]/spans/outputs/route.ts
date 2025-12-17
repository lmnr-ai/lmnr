import { NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getSpanOutputs } from "@/lib/actions/spans/outputs.ts";

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; traceId: string }> }
): Promise<Response> {
  const params = await props.params;
  const { projectId, traceId } = params;

  try {
    const body = await req.json();

    const outputs = await getSpanOutputs({ projectId, traceId, ...body });

    return NextResponse.json({ outputs });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch span outputs." },
      { status: 500 }
    );
  }
}
