import { prettifyError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import { createPlayground, deletePlaygrounds, getPlaygrounds, GetPlaygroundsSchema } from "@/lib/actions/playgrounds";
import { apiHandler } from "@/lib/api/api-handler";
import { withAudit } from "@/lib/audit";

export const GET = apiHandler<{ projectId: string }>(async (req, ctx) => {
  const { projectId } = await ctx.params;

  const parseResult = parseUrlParams(req.nextUrl.searchParams, GetPlaygroundsSchema.omit({ projectId: true }));

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  return Response.json(await getPlaygrounds({ ...parseResult.data, projectId }));
});

export const POST = withAudit<{ projectId: string }>(
  { resource: "playground", action: "create" },
  async (req, ctx, audit) => {
    const { projectId } = await ctx.params;
    const body = await req.json();
    const playground = await createPlayground({ projectId, name: body.name });
    await audit.target(playground.id, { name: playground.name });
    return Response.json(playground);
  }
);

export const DELETE = withAudit<{ projectId: string }>(
  { resource: "playground", action: "delete" },
  async (req, ctx, audit) => {
    const { projectId } = await ctx.params;
    const playgroundIds = req.nextUrl.searchParams.get("playgroundIds")?.split(",").filter(Boolean);

    if (!playgroundIds) {
      return Response.json({ error: "At least one playground id is required" }, { status: 400 });
    }

    await audit.target(playgroundIds);
    await deletePlaygrounds({ projectId, playgroundIds });

    return Response.json({ message: "Playgrounds deleted successfully" });
  }
);
