import { createWorkspace, getWorkspaces } from "@/lib/actions/workspaces";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute(async () => getWorkspaces());

export const POST = handleRoute(async (req) => {
  const body = await req.json();
  return createWorkspace(body);
});
