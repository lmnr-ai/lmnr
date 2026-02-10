import { NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getDeployment, updateDeployment } from "@/lib/actions/workspace/deployment";

export async function GET(_req: Request, props: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  const params = await props.params;

  const { workspaceId } = params;

  try {
    const result = await getDeployment({ workspaceId });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ error: "Failed to get deployment." }, { status: 500 });
  }
}

export async function PUT(req: Request, props: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  const params = await props.params;

  const { workspaceId } = params;

  try {
    const body = await req.json();
    await updateDeployment({ workspaceId, ...body });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ error: "Failed to update deployment." }, { status: 500 });
  }
}
