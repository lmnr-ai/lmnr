import { prettifyError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import { createSignal, deleteSignals, getSignals, GetSignalsSchema, setTemplateSignals } from "@/lib/actions/signals";
import { apiHandler } from "@/lib/api/api-handler";
import { withAudit } from "@/lib/audit";
import { getServerSession } from "@/lib/auth-session";

export const GET = apiHandler<{ projectId: string }>(async (request, ctx) => {
  const { projectId } = await ctx.params;

  const parseResult = parseUrlParams(request.nextUrl.searchParams, GetSignalsSchema.omit({ projectId: true }));

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  const result = await getSignals({ ...parseResult.data, projectId });
  return Response.json(result);
});

export const POST = withAudit<{ projectId: string }>(
  { resource: "signal", action: "create" },
  async (request, ctx, audit) => {
    const { projectId } = await ctx.params;

    const session = await getServerSession();
    const subscriberEmail = session?.user?.email ?? undefined;
    const body = await request.json();

    const result = await createSignal({ ...body, projectId, subscriberEmail });
    await audit.target(result.id, { name: result.name });

    return Response.json(result);
  }
);

// Creates and removes template signals by name.
export const PUT = withAudit<{ projectId: string }>(
  { resource: "signal", action: "update", noTarget: true },
  async (request, ctx, audit) => {
    const { projectId } = await ctx.params;

    const session = await getServerSession();
    const subscriberEmail = session?.user?.email ?? undefined;
    const body = await request.json();

    const result = await setTemplateSignals({ ...body, projectId, subscriberEmail });
    audit.set({ metadata: { templateNames: body.templateNames } });

    return Response.json(result);
  }
);

export const DELETE = withAudit<{ projectId: string }>(
  { resource: "signal", action: "delete" },
  async (request, ctx, audit) => {
    const { projectId } = await ctx.params;

    const body = await request.json();
    await audit.target(body.ids);

    const result = await deleteSignals({ projectId, ...body });

    return Response.json(result);
  }
);
