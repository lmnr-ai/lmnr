import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getEmergingClusterName } from "@/lib/actions/events/emerging-cluster";
import { hasClusteringAccessForProject } from "@/lib/actions/usage/utils";
import { PAYWALL_CLUSTER_NAME } from "@/lib/features/clustering";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; id: string; emergingClusterId: string }> }
): Promise<NextResponse> {
  try {
    const { projectId, id: signalId, emergingClusterId } = await params;

    const [result, hasAccess] = await Promise.all([
      getEmergingClusterName({ projectId, signalId, emergingClusterId }),
      hasClusteringAccessForProject(projectId),
    ]);

    if (!result) {
      return NextResponse.json({ error: "Emerging cluster not found." }, { status: 404 });
    }

    return NextResponse.json(hasAccess ? result : { name: PAYWALL_CLUSTER_NAME });
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
