import { NextRequest, NextResponse } from "next/server";

import { ExportSpanSchema, exportSpanToDataset } from "@/lib/actions/span";

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; spanId: string }> }
): Promise<Response> {
  try {
    const params = await props.params;
    const { projectId, spanId } = params;

    const body = await req.json();

    const result = ExportSpanSchema.safeParse({
      ...body,
      spanId,
      projectId,
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

    await exportSpanToDataset(result.data);

    return NextResponse.json("Span exported to dataset successfully");
  } catch (error) {
    if (error instanceof Error) {
      console.error(error);
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json({ error: "Failed to export span" }, { status: 500 });
  }
}
