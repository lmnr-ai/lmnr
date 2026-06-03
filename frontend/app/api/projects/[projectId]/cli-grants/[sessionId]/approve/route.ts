import { type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { prettifyError, ZodError } from "zod/v4";

import { approveGrant } from "@/lib/actions/cli-login";
import { authOptions } from "@/lib/auth";

export async function POST(
  _req: NextRequest,
  props: { params: Promise<{ projectId: string; sessionId: string }> }
): Promise<Response> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.email) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }
    const params = await props.params;
    const result = await approveGrant({
      sessionId: params.sessionId,
      projectId: params.projectId,
      userId: session.user.id,
      userEmail: session.user.email,
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    const status = (error as { status?: number })?.status;
    if (status) {
      return Response.json({ error: error instanceof Error ? error.message : "Error" }, { status });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
