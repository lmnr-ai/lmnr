import { NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { generateRenderTemplate } from "@/lib/actions/render-template/generate";

export async function POST(req: Request, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  try {
    const { projectId } = await props.params;
    const body = await req.json();

    const result = await generateRenderTemplate({ ...body, projectId });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate the template." },
      { status: 500 }
    );
  }
}
