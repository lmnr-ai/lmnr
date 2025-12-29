import { NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getTraceSystemMessages } from "@/lib/actions/spans/system-messages";

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; traceId: string }> }
): Promise<Response> {
  const params = await props.params;
  const { projectId, traceId } = params;

  try {
    const body = await req.json();
    const paths = body.paths as string[];

    if (!Array.isArray(paths)) {
      return NextResponse.json({ error: "paths must be an array of strings" }, { status: 400 });
    }

    const systemMessages = await getTraceSystemMessages({ projectId, traceId, paths });

    return NextResponse.json(systemMessages);
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(e) }, { status: 400 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to get system messages." },
      { status: 500 }
    );
  }
}
