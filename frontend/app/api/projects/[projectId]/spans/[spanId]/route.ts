import { NextResponse } from "next/server";

import { updateSpanOutput, UpdateSpanOutputSchema } from "@/lib/actions/span";

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

    await updateSpanOutput({
      spanId,
      projectId,
      output: result.data.output,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ error: "Failed to update span" }, { status: 500 });
  }
}
