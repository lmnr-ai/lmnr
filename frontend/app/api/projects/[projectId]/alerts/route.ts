import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prettifyError, ZodError } from "zod/v4";

import { createAlert, deleteAlert, getAlerts } from "@/lib/actions/alerts";
import { authOptions } from "@/lib/auth";

export async function GET(_request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await props.params;

  try {
    const session = await getServerSession(authOptions);
    const userEmail = session?.user?.email ?? undefined;
    const result = await getAlerts(projectId, userEmail);
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch alerts." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await props.params;

  try {
    const session = await getServerSession(authOptions);
    const userEmail = session?.user?.email;
    if (!userEmail) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const emailTargets = (body.targets ?? []).filter((t: { type: string; email?: string }) => t.type === "EMAIL");
    if (emailTargets.some((t: { email?: string }) => t.email && t.email !== userEmail)) {
      return NextResponse.json({ error: "Cannot create alert targets for other users' emails." }, { status: 403 });
    }
    const result = await createAlert({ ...body, projectId });
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create alert." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await props.params;

  try {
    const body = await request.json();
    const result = await deleteAlert({ ...body, projectId });
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete alert." },
      { status: 500 }
    );
  }
}
