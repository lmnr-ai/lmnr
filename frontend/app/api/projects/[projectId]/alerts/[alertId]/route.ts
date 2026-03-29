import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prettifyError, ZodError } from "zod/v4";

import { updateAlert } from "@/lib/actions/alerts";
import { authOptions } from "@/lib/auth";

export async function PATCH(request: NextRequest, props: { params: Promise<{ projectId: string; alertId: string }> }) {
  const { projectId, alertId } = await props.params;

  try {
    const session = await getServerSession(authOptions);
    const userEmail = session?.user?.email ?? undefined;
    const body = await request.json();
    const result = await updateAlert({ ...body, projectId, alertId, userEmail });
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update alert." },
      { status: 500 }
    );
  }
}
