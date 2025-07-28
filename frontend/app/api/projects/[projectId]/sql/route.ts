import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { fetcherJSON } from "@/lib/utils";

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    const { sqlQuery } = await request.json();
    const projectId = (await params).projectId;

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!sqlQuery?.trim()) {
      return NextResponse.json({ error: "SQL query is required" }, { status: 400 });
    }

    const user = session.user;

    const res = await fetcherJSON(`/projects/${projectId}/sql/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.apiKey}`,
      },
      body: JSON.stringify({ query: sqlQuery }),
    });

    return NextResponse.json(res);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage, success: false, result: null, warnings: null }, { status: 500 });
  }
}
