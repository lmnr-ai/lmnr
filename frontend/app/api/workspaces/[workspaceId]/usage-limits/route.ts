import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getUsageLimits, removeUsageLimit, setUsageLimit } from "@/lib/actions/usage/custom-usage-limits";

export async function GET(_req: NextRequest, props: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  try {
    const params = await props.params;
    const limits = await getUsageLimits({ workspaceId: params.workspaceId });
    return Response.json(limits);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to get usage limits." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, props: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  try {
    const params = await props.params;
    const body = await req.json();
    const result = await setUsageLimit({ ...body, workspaceId: params.workspaceId });
    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to set usage limit." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  try {
    const params = await props.params;
    const body = await req.json();
    await removeUsageLimit({ ...body, workspaceId: params.workspaceId });
    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to remove usage limit." },
      { status: 500 }
    );
  }
}
