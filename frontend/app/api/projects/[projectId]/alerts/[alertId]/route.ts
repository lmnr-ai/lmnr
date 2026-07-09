import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { AlertEmailTargetError, patchAlert } from "@/lib/actions/alerts";
import { getServerSession } from "@/lib/auth-session";

export async function PATCH(request: NextRequest, props: { params: Promise<{ projectId: string; alertId: string }> }) {
  const { projectId, alertId } = await props.params;

  try {
    const session = await getServerSession();
    const userEmail = session?.user?.email ?? undefined;
    const body = await request.json();

    const result = await patchAlert({ projectId, alertId, userEmail, body });
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    if (error instanceof AlertEmailTargetError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update alert." },
      { status: 500 }
    );
  }
}
