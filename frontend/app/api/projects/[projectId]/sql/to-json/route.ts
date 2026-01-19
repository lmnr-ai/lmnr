import { type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { prettifyError, ZodError } from "zod/v4";

import { sqlToJson } from "@/lib/actions/sql";
import { authOptions } from "@/lib/auth";

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    const body = await request.json();
    const projectId = (await params).projectId;

    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await sqlToJson({ projectId, sql: body.sql });

    return Response.json({ success: true, jsonStructure: JSON.stringify(data) });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ success: false, error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to convert SQL to JSON." },
      { status: 500 }
    );
  }
}
