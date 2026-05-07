import { transferOwnership } from "@/lib/actions/workspace";
import { apiHandler } from "@/lib/api/api-handler";

export const POST = apiHandler<{ workspaceId: string }>(async (req, ctx) => {
  const { workspaceId } = await ctx.params;
  const body = await req.json();

  await transferOwnership({
    workspaceId,
    currentOwnerId: body.currentOwnerId,
    newOwnerId: body.newOwnerId,
  });

  return Response.json({ success: true });
});
