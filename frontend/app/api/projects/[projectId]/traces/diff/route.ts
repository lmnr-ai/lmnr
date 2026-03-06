import { NextResponse } from "next/server";
import { prettifyError, z, ZodError } from "zod/v4";

import { generateSpanMapping } from "@/lib/actions/trace/diff";

const DiffRequestSchema = z.object({
  leftTraceId: z.string(),
  rightTraceId: z.string(),
});

export async function POST(req: Request, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const { projectId } = await props.params;

  try {
    const body = DiffRequestSchema.parse(await req.json());
    const mapping = await generateSpanMapping(projectId, body.leftTraceId, body.rightTraceId);
    return NextResponse.json(mapping);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate span mapping." },
      { status: 500 }
    );
  }
}
