import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { generateTemplate } from "@/lib/actions/render-template/generate";

// Auth/membership is enforced by proxy.ts middleware for all /api/projects/* routes.
export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  try {
    const body = await request.json();

    const result = await generateTemplate({ ...body, projectId });

    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to generate template." },
      { status: 500 }
    );
  }
}
