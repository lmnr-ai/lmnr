import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/drizzle";
import { traces } from "@/lib/db/migrations/schema";

export async function GET(_request: Request, props: { params: Promise<{ traceId: string }> }) {
  const params = await props.params;
  try {
    const trace = (await db.query.traces.findFirst({
      where: eq(traces.id, params.traceId),
      columns: {
        visibility: true,
      },
    })) as undefined | { visibility: "public" | "private" };

    if (!trace) {
      return "private";
    }

    return NextResponse.json({ visibility: trace.visibility });
  } catch (error) {
    return NextResponse.json({ visibility: "private" }, { status: 500 });
  }
}
