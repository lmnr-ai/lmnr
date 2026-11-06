import { updatePlayground } from "@/lib/actions/playgrounds";
import { handlerWithAudit } from "@/lib/audit";

export const POST = handlerWithAudit<{ projectId: string; playgroundId: string }>(
  { resource: "playground", action: "update" },
  async (req, ctx, audit) => {
    const { projectId, playgroundId } = await ctx.params;
    const body = await req.json();
    const playground = await updatePlayground({ ...body, projectId, playgroundId });
    await audit.target(playgroundId);
    return Response.json(playground);
  }
);
