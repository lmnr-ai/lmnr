import { z } from "zod/v4";

import { setTrialContinues, startStarterTrial, trialConvertsToPaid } from "@/lib/actions/checkout/trial";
import { apiHandler } from "@/lib/api/api-handler";
import { withAudit } from "@/lib/audit";

type Params = { workspaceId: string };

export const GET = apiHandler<Params>(async (_req, ctx) => {
  const { workspaceId } = await ctx.params;
  return Response.json({ convertsToPaid: await trialConvertsToPaid(workspaceId) });
});

export const POST = withAudit<Params>({ resource: "subscription", action: "create" }, async (_req, ctx) => {
  const { workspaceId } = await ctx.params;
  return Response.json(await startStarterTrial({ workspaceId, source: "billing" }));
});

const PatchSchema = z.object({ continues: z.boolean() });

export const PATCH = withAudit<Params>({ resource: "subscription", action: "update" }, async (req, ctx) => {
  const { workspaceId } = await ctx.params;
  const { continues } = PatchSchema.parse(await req.json());
  await setTrialContinues(workspaceId, continues);
  return Response.json({ success: true });
});
