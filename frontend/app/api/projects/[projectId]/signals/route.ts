import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prettifyError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import { createSignal, deleteSignals, getSignals, GetSignalsSchema, setTemplateSignals } from "@/lib/actions/signals";
import { apiHandler } from "@/lib/api/api-handler";
import { authOptions } from "@/lib/auth";

export const GET = apiHandler<{ projectId: string }>(async (request, ctx) => {
  const { projectId } = await ctx.params;

  const parseResult = parseUrlParams(request.nextUrl.searchParams, GetSignalsSchema.omit({ projectId: true }));

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  const result = await getSignals({ ...parseResult.data, projectId });
  return Response.json(result);
});

export const POST = apiHandler<{ projectId: string }>(async (request, ctx) => {
  const { projectId } = await ctx.params;

  const session = await getServerSession(authOptions);
  const subscriberEmail = session?.user?.email ?? undefined;
  const body = await request.json();

  const result = await createSignal({ ...body, projectId, subscriberEmail });

  return Response.json(result);
});

export const DELETE = apiHandler<{ projectId: string }>(async (request, ctx) => {
  const { projectId } = await ctx.params;

  const body = await request.json();

  const result = await deleteSignals({ projectId, ...body });

  return Response.json(result);
});

export const PUT = apiHandler<{ projectId: string }>(async (request, ctx) => {
  const { projectId } = await ctx.params;

  const session = await getServerSession(authOptions);

  const subscriberEmail = session?.user?.email ?? undefined;

  const body = await request.json();

  const result = await setTemplateSignals({ ...body, projectId, subscriberEmail });

  return NextResponse.json(result);
});
