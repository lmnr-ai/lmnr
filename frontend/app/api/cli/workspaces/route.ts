import { type NextRequest } from "next/server";

import { listAccessibleWorkspaces } from "@/lib/actions/workspaces";
import { resolveCaller } from "@/lib/oauth/resolve-caller";

export async function GET(req: NextRequest): Promise<Response> {
  const caller = await resolveCaller(req);
  if (!caller) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  try {
    const workspaces = await listAccessibleWorkspaces(caller.userId);
    return Response.json({ workspaces });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
