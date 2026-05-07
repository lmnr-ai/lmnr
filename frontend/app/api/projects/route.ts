import { getServerSession } from "next-auth";

import { createProject } from "@/lib/actions/projects";
import { apiHandler } from "@/lib/api/api-handler";
import { authOptions } from "@/lib/auth";

export const POST = apiHandler(async (req) => {
  const session = await getServerSession(authOptions);
  const user = session!.user;

  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const body = await req.json();
  const project = await createProject({
    name: body.name,
    workspaceId: body.workspaceId,
  });

  return Response.json(project);
});
