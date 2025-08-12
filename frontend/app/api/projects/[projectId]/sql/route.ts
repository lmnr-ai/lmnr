import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { prettifyError, ZodError } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";
import { authOptions } from "@/lib/auth";

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    const body = await request.json();
    const projectId = (await params).projectId;

    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = session.user;

    const data = await executeQuery({ ...body, projectId, apiKey: user.apiKey });

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
