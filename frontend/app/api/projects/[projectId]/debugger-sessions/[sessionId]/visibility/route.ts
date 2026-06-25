import { type NextRequest } from "next/server";

import { isDebuggerSessionPublic } from "@/lib/actions/debugger-sessions/visibility";

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ projectId: string; sessionId: string }> }
): Promise<Response> {
  const { sessionId } = await props.params;

  try {
    const isPublic = await isDebuggerSessionPublic(sessionId);
    return Response.json({ visibility: isPublic ? "public" : "private" });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch session visibility." },
      { status: 500 }
    );
  }
}
