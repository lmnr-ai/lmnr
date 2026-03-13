import { removeUserFromWorkspace } from "@/lib/actions/workspace";
import { handleRoute,HttpError } from "@/lib/api/route-handler";

export const DELETE = handleRoute<{ workspaceId: string }, { message: string }>(async (req, { workspaceId }) => {
  const url = new URL(req.url);
  const userId = url.searchParams.get("id");

  if (!userId) {
    throw new HttpError("No user id was provided", 400);
  }

  await removeUserFromWorkspace({ workspaceId, userId });
  return { message: "User removed successfully." };
});
