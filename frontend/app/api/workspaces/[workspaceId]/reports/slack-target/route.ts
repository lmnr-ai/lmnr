import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { removeSlackTarget, setSlackTarget } from "@/lib/actions/reports";

export async function POST(request: NextRequest, props: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await props.params;

  try {
    const body = await request.json();
    const result = await setSlackTarget({ ...body, workspaceId });
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to set Slack target." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await props.params;

  try {
    const body = await request.json();
    const result = await removeSlackTarget({ ...body, workspaceId });
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to remove Slack target." },
      { status: 500 }
    );
  }
}
