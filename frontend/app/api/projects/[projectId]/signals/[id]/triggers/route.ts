import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils.ts";
import {
  createSignalTriggerOnAppServer,
  deleteSignalTriggers,
  getSignalTriggers,
  GetSignalTriggersSchema,
  updateSignalTrigger,
} from "@/lib/actions/signal-triggers";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; id: string }> }
): Promise<Response> {
  const params = await props.params;
  const { projectId, id: signalId } = params;

  const parseResult = parseUrlParams(
    req.nextUrl.searchParams,
    GetSignalTriggersSchema.omit({ projectId: true, signalId: true })
  );

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  try {
    const result = await getSignalTriggers({ ...parseResult.data, projectId, signalId });

    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch triggers." },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; id: string }> }
): Promise<Response> {
  const params = await props.params;
  const { projectId, id: signalId } = params;

  try {
    const body = await req.json();

    // Trigger creation is owned by app-server (shared with the CLI). Membership
    // is enforced by proxy.ts before this route runs.
    const res = await createSignalTriggerOnAppServer(projectId, signalId, {
      filters: body.filters,
      mode: body.mode ?? 0,
    });
    const data = await res.json().catch(() => null);
    return Response.json(data ?? { error: "Failed to create trigger." }, { status: res.status });
  } catch {
    return Response.json({ error: "Failed to create trigger." }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; id: string }> }
): Promise<Response> {
  const params = await props.params;
  const { projectId, id: signalId } = params;

  try {
    const body = await req.json();
    const result = await updateSignalTrigger({
      projectId,
      signalId,
      triggerId: body.triggerId,
      filters: body.filters,
      mode: body.mode,
    });

    if (!result) {
      return Response.json({ error: "Trigger not found" }, { status: 404 });
    }

    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to update trigger." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; id: string }> }
): Promise<Response> {
  const params = await props.params;
  const { projectId, id: signalId } = params;

  try {
    const body = await req.json();
    const result = await deleteSignalTriggers({
      projectId,
      signalId,
      triggerIds: body.triggerIds,
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to delete triggers." },
      { status: 500 }
    );
  }
}
