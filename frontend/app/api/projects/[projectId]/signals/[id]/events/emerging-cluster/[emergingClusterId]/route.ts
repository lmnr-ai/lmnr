import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getEmergingClusterName } from "@/lib/actions/events/emerging-cluster";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; id: string; emergingClusterId: string }> }
): Promise<NextResponse> {
  try {
    const { projectId, id: signalId, emergingClusterId } = await params;

    const result = await getEmergingClusterName({ projectId, signalId, emergingClusterId });

    if (!result) {
      return NextResponse.json({ error: "Emerging cluster not found." }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get emerging cluster. Please try again." },
      { status: 500 }
    );
  }
}
