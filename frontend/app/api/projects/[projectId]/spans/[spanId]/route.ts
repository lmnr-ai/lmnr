import { NextResponse } from "next/server";

import { getSpan, updateSpanOutput, UpdateSpanOutputSchema } from "@/lib/actions/span";

export async function GET(
  _req: Request,
  props: { params: Promise<{ projectId: string; spanId: string }> }
): Promise<Response> {
  const params = await props.params;
  const { projectId, spanId } = params;

  try {
    const span = await getSpan({ spanId, projectId });
    return NextResponse.json(span);
  } catch (error) {
    return NextResponse.json({ error: "Span not found" }, { status: 404 });
  }
}

export async function PATCH(
  req: Request,
  props: { params: Promise<{ projectId: string; spanId: string }> }
): Promise<Response> {
  const params = await props.params;
  const { projectId, spanId } = params;

  try {
    const body = await req.json();
    const result = UpdateSpanOutputSchema.omit({ spanId: true, projectId: true }).safeParse(body);

    if (!result.success) {
      return new Response("Invalid request body", { status: 400 });
    }

    const updatedSpan = await updateSpanOutput({
      spanId,
      projectId,
      output: result.data.output,
    });

    return NextResponse.json(updatedSpan);
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ error: "Failed to update span" }, { status: 500 });
  }
}
