import { updatePlayground } from "@/lib/actions/playgrounds";
import { withAudit } from "@/lib/audit";

export const POST = withAudit<{ projectId: string; playgroundId: string }>(
  { resource: "playground", action: "update" },
  async (req, ctx) => {
    const { projectId, playgroundId } = await ctx.params;
    const body = await req.json();
    return Response.json(await updatePlayground({ ...body, projectId, playgroundId }));
  }
);
