import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getGroupName } from "@/lib/actions/events/group";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; id: string; groupId: string }> }
): Promise<NextResponse> {
  try {
    const { projectId, id: signalId, groupId } = await params;

    const result = await getGroupName({ projectId, signalId, groupId });

    if (!result) {
      return NextResponse.json({ error: "Group not found." }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get group. Please try again." },
      { status: 500 }
    );
  }
}
