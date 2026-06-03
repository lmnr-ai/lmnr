import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { createGrant, sweepExpiredGrants } from "@/lib/actions/cli-login";

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = await req.json();
    const result = await createGrant(body);
    // Fire-and-forget cleanup. Cheap, indexed predicate.
    void sweepExpiredGrants();
    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    const status = (error as { status?: number })?.status;
    if (status) {
      return Response.json({ error: error instanceof Error ? error.message : "Error" }, { status });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
