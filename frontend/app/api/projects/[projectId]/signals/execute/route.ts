import { executeSignal } from "@/lib/actions/signals/execute";
import { handleRoute } from "@/lib/api/route-handler";

export const POST = handleRoute(async (req, { projectId }) => {
  const body = await req.json();
  return executeSignal({ ...body, projectId });
});
