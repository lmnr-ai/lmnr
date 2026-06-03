import { getServerSession } from "next-auth";

import { getUserContext } from "@/lib/actions/cli-login";
import { authOptions } from "@/lib/auth";

export async function GET(): Promise<Response> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }
    const ctx = await getUserContext({ userId: session.user.id });
    return Response.json(ctx);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
