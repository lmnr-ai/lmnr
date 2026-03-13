import { getServerSession } from "next-auth";

import { createProject } from "@/lib/actions/projects";
import { handleRoute } from "@/lib/api/route-handler";
import { authOptions } from "@/lib/auth";

export const POST = handleRoute(async (req) => {
  const session = await getServerSession(authOptions);
  const user = session!.user;

  if (!user) {
    throw new Error("Unauthorized");
  }

  const body = await req.json();
  return createProject({
    name: body.name,
    workspaceId: body.workspaceId,
  });
});
