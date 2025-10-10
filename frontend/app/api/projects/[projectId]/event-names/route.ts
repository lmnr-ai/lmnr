import { NextRequest, NextResponse } from "next/server";

import { getEventNames } from "@/lib/actions/events/paginated";

export async function GET(_request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;

  try {
    const names = await getEventNames(projectId);
    return NextResponse.json(names);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch event names." },
      { status: 500 }
    );
  }
}

