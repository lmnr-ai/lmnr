import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const body = await request.json();
    const projectId = (await params).projectId;

    const data = await executeQuery({ ...body, projectId });

    return Response.json(data);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to execute query." },
      { status: 500 }
    );
  }
}
