import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { duplicateChart } from "@/lib/actions/dashboard";

export async function POST(
  _req: NextRequest,
  props: { params: Promise<{ projectId: string; id: string }> }
): Promise<Response> {
  const { projectId, id } = await props.params;

  try {
    const chart = await duplicateChart({ projectId, id });

    if (!chart) {
      return Response.json({ error: "Chart not found" }, { status: 404 });
    }

    return Response.json(chart);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to duplicate chart. Please try again." },
      { status: 500 }
    );
  }
}
