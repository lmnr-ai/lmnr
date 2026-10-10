import { updateRole } from "@/lib/actions/workspace";
import { apiHandler } from "@/lib/api/api-handler";

export const PATCH = apiHandler<{ workspaceId: string }>(async (req, ctx) => {
  const { workspaceId } = await ctx.params;
  const body = await req.json();

  await updateRole({
    workspaceId,
    ...body,
  });

  return Response.json({ success: true, message: "User role updated successfully" });
});
