import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { getSlackIntegration } from "@/lib/actions/slack";
import { authOptions } from "@/lib/auth";

export async function GET(_request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const integration = await getSlackIntegration(projectId);

  return NextResponse.json(integration);
}
