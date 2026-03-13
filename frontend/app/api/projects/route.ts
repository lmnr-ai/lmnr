import { getServerSession } from "next-auth";

import { createProject } from "@/lib/actions/projects";
import { handleRoute,HttpError } from "@/lib/api/route-handler";
import { authOptions } from "@/lib/auth";

export const POST = handleRoute(async (req) => {
  const session = await getServerSession(authOptions);
  const user = session!.user;

  if (!user) {
    throw new HttpError("Unauthorized", 401);
  }

  const body = await req.json();
  return createProject({
    name: body.name,
    workspaceId: body.workspaceId,
  });
});
