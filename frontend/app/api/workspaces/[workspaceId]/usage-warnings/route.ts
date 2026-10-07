import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { addUsageWarning, getUsageWarnings, removeUsageWarning } from "@/lib/actions/usage/usage-warnings";

export async function GET(_req: NextRequest, props: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  try {
    const params = await props.params;
    const warnings = await getUsageWarnings({ workspaceId: params.workspaceId });
    return Response.json(warnings);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to get usage warnings." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, props: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  try {
    const params = await props.params;
    const body = await req.json();
    const result = await addUsageWarning({ ...body, workspaceId: params.workspaceId });
    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to add usage warning." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  try {
    const params = await props.params;
    const body = await req.json();
    await removeUsageWarning({ ...body, workspaceId: params.workspaceId });
    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to remove usage warning." },
      { status: 500 }
    );
  }
}
