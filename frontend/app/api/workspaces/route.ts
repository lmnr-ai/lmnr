import { createWorkspace, getWorkspaces } from "@/lib/actions/workspaces";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler(async () => {
  const workspaces = await getWorkspaces();

  return Response.json(workspaces);
});

export const POST = apiHandler(async (req) => {
  const body = await req.json();
  const workspace = await createWorkspace(body);

  return Response.json(workspace);
});
