import { type NextRequest, NextResponse } from "next/server";

import { listProjectRepoOptions } from "@/lib/actions/github";

export async function GET(_request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await props.params;
  try {
    return NextResponse.json(await listProjectRepoOptions(projectId));
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list repositories" },
      { status: 500 }
    );
  }
}
