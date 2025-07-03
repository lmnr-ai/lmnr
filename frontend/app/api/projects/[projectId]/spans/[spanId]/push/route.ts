import { NextRequest, NextResponse } from "next/server";

import { PushSpanSchema, pushSpanToLabelingQueue } from "@/lib/actions/span";

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; spanId: string }> }
): Promise<Response> {
  try {
    const params = await props.params;
    const { projectId, spanId } = params;

    const body = await req.json();

    const result = PushSpanSchema.safeParse({
      ...body,
      projectId,
      spanId,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          details: result.error.issues,
        },
        { status: 400 }
      );
    }

    await pushSpanToLabelingQueue(result.data);

    return NextResponse.json("Span pushed to labeling queue successfully");
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: "Failed to push span to labeling queue" }, { status: 500 });
  }
}
