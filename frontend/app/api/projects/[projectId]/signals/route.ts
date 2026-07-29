import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import {
  createSignalOnAppServer,
  deleteSignals,
  getSignals,
  GetSignalsSchema,
  setTemplateSignals,
} from "@/lib/actions/signals";
import { getServerSession } from "@/lib/auth-session";

export async function GET(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;

  const parseResult = parseUrlParams(request.nextUrl.searchParams, GetSignalsSchema.omit({ projectId: true }));

  if (!parseResult.success) {
    return NextResponse.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  try {
    const result = await getSignals({ ...parseResult.data, projectId });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch signals." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;

  try {
    const session = await getServerSession();
    const subscriberEmail = session?.user?.email ?? undefined;
    const body = await request.json();

    // Signal creation is owned by app-server (shared with the CLI). Membership
    // is enforced by proxy.ts before this route runs; we resolve the session
    // email here and forward it as the alert-target subscriber.
    const res = await createSignalOnAppServer(projectId, { ...body, subscriberEmail });
    const data = await res.json().catch(() => null);
    return NextResponse.json(data ?? { error: "Failed to create signal." }, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Failed to create signal." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await props.params;

  try {
    const session = await getServerSession();
    const subscriberEmail = session?.user?.email ?? undefined;
    const body = await request.json();
    const result = await setTemplateSignals({ ...body, projectId, subscriberEmail });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to set template signals." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;

  try {
    const body = await request.json();

    const result = await deleteSignals({ projectId, ...body });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete signals." },
      { status: 500 }
    );
  }
}
