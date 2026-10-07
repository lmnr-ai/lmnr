import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { generateSql } from "@/lib/actions/sql/generate";

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const body = await request.json();

    const result = await generateSql({ ...body, projectId });

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 400 });
    }

    return Response.json({ query: result.result });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to generate query." },
      { status: 500 }
    );
  }
}
