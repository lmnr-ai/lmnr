import { type NextRequest, NextResponse } from "next/server";

import { searchProjectRepoOptions } from "@/lib/actions/github";

export async function GET(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await props.params;
  try {
    const query = request.nextUrl.searchParams.get("q") ?? "";
    return NextResponse.json(await searchProjectRepoOptions(projectId, query));
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list repositories" },
      { status: 500 }
    );
  }
}
