import { eq } from "drizzle-orm";
import { type NextRequest } from "next/server";

import { getTraceUserInput } from "@/lib/actions/sessions/trace-io";
import { db } from "@/lib/db/drizzle";
import { sharedTraces } from "@/lib/db/migrations/schema";

export async function GET(_req: NextRequest, props: { params: Promise<{ traceId: string }> }): Promise<Response> {
  const { traceId } = await props.params;

  try {
    const sharedTrace = await db.query.sharedTraces.findFirst({
      where: eq(sharedTraces.id, traceId),
    });

    if (!sharedTrace) {
      return Response.json({ error: "No shared trace found." }, { status: 404 });
    }

    const input = await getTraceUserInput(traceId, sharedTrace.projectId);
    return Response.json({ input });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
