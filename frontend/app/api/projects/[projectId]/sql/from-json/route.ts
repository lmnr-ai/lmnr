import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { jsonToSql } from "@/lib/actions/sql";

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const body = await request.json();
    const projectId = (await params).projectId;

    const data = await jsonToSql({ projectId, ...body });

    return Response.json({ success: true, sql: data });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ success: false, error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to convert JSON to SQL." },
      { status: 500 }
    );
  }
}
