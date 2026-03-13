import { updateRole } from "@/lib/actions/workspace";
import { handleRoute } from "@/lib/api/route-handler";

export const PATCH = handleRoute<{ workspaceId: string }, { success: boolean; message: string }>(
  async (req, { workspaceId }) => {
    const body = await req.json();
    await updateRole({ workspaceId, ...body });
    return { success: true, message: "User role updated successfully" };
  }
);
