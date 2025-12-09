import { NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import {
  createClusterConfig,
  deleteClusterConfig,
  getClusterConfig,
} from "@/lib/actions/cluster-configs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; name: string }> }
): Promise<NextResponse> {
  try {
    const { projectId, name: eventName } = await params;
    const searchParams = req.nextUrl.searchParams;
    const eventSource = searchParams.get("eventSource") as "semantic" | "code";

    const result = await getClusterConfig({
      projectId,
      eventName,
      eventSource,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get cluster config." },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; name: string }> }
): Promise<NextResponse> {
  try {
    const { projectId, name: eventName } = await params;
    const body = await req.json();

    const result = await createClusterConfig({
      projectId,
      eventName,
      valueTemplate: body.valueTemplate,
      eventSource: body.eventSource,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create cluster config." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; name: string }> }
): Promise<NextResponse> {
  try {
    const { projectId, name: eventName } = await params;
    const searchParams = req.nextUrl.searchParams;
    const eventSource = searchParams.get("eventSource") as "semantic" | "code";

    const result = await deleteClusterConfig({
      projectId,
      eventName,
      eventSource,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete cluster config." },
      { status: 500 }
    );
  }
}

