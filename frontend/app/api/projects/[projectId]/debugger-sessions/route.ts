import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import {
  createDebuggerSession,
  CreateDebuggerSessionSchema,
  getDebuggerSessions,
  GetDebuggerSessionsSchema,
} from "@/lib/actions/debugger-sessions";

export async function GET(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;

  const parseResult = parseUrlParams(request.nextUrl.searchParams, GetDebuggerSessionsSchema.omit({ projectId: true }));

  if (!parseResult.success) {
    return NextResponse.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  try {
    const result = await getDebuggerSessions({ ...parseResult.data, projectId });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get debugger sessions." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await props.params;

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // empty body is allowed — id/name are optional
  }

  const parseResult = CreateDebuggerSessionSchema.omit({ projectId: true }).safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  try {
    const session = await createDebuggerSession({ ...parseResult.data, projectId });
    return NextResponse.json(session);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create debugger session." },
      { status: 500 }
    );
  }
}
