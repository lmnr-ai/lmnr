import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { createSlackSubscription, deleteSlackSubscription, getSlackSubscriptions } from "@/lib/actions/slack";

export async function GET(_request: NextRequest, props: { params: Promise<{ workspaceId: string }> }) {
  const params = await props.params;
  const workspaceId = params.workspaceId;

  try {
    const subscriptions = await getSlackSubscriptions(workspaceId);
    return NextResponse.json(subscriptions);
  } catch (error) {
    console.error(error);
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch subscriptions." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, props: { params: Promise<{ workspaceId: string }> }) {
  await props.params;

  try {
    const body = await request.json();
    const result = await createSlackSubscription(body);
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create subscription." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ workspaceId: string }> }) {
  await props.params;

  try {
    const body = await request.json();
    const result = await deleteSlackSubscription(body);
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete subscription." },
      { status: 500 }
    );
  }
}
