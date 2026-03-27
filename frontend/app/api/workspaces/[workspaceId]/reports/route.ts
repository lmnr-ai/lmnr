import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prettifyError, ZodError } from "zod/v4";

import { getReports, optInReport, optOutReport } from "@/lib/actions/reports";
import { authOptions } from "@/lib/auth";

export async function GET(_request: NextRequest, props: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await props.params;

  try {
    const session = await getServerSession(authOptions);
    const userEmail = session?.user?.email ?? undefined;
    const result = await getReports(workspaceId, userEmail);
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch reports." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, props: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await props.params;

  try {
    const body = await request.json();
    const result = await optInReport({ ...body, workspaceId });
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to opt in to report." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await props.params;

  try {
    const body = await request.json();
    const result = await optOutReport({ ...body, workspaceId });
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to opt out of report." },
      { status: 500 }
    );
  }
}
