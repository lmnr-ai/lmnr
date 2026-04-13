import { NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getSpan } from "@/lib/actions/span";

/**
 * Bare span lookup by id. Used by deep-link resolvers (e.g. the session view's
 * `UrlSpanResolver`) that have a spanId but don't yet know which trace owns it.
 * `getSpan` already accepts an optional traceId — omitting it performs a pure
 * span-id lookup.
 */
export async function GET(
  _req: Request,
  props: { params: Promise<{ projectId: string; spanId: string }> }
): Promise<Response> {
  const params = await props.params;
  const { projectId, spanId } = params;

  try {
    const span = await getSpan({ spanId, projectId });
    return NextResponse.json(span);
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(e) }, { status: 400 });
    }
    const message = e instanceof Error ? e.message : "Failed to get span.";
    const status = message === "Span not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
