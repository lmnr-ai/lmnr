import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import {
  createSignalTrigger,
  deleteSignalTriggers,
  getSignalTriggers,
  updateSignalTrigger,
} from "@/lib/actions/signal-triggers";

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ projectId: string; id: string }> }
): Promise<Response> {
  const params = await props.params;
  const { projectId, id: signalId } = params;

  try {
    const result = await getSignalTriggers({ projectId, signalId });
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
    const result = await createSignalTrigger({
      projectId,
      signalId,
      filters: body.filters,
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to create trigger." },
      { status: 500 }
    );
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
