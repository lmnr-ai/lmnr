import { type NextRequest } from "next/server";

import { getGrant } from "@/lib/actions/cli-login";

export async function GET(_req: NextRequest, props: { params: Promise<{ sessionId: string }> }): Promise<Response> {
  try {
    const params = await props.params;
    const result = await getGrant({ sessionId: params.sessionId });
    if (!result) {
      return Response.json({ error: "Not found", status: "not_found" }, { status: 404 });
    }
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
