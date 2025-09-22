import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/drizzle";
import { sharedTraces } from "@/lib/db/migrations/schema";

export async function GET(_request: Request, props: { params: Promise<{ traceId: string }> }) {
  const params = await props.params;
  try {
    const trace = await db.query.sharedTraces.findFirst({
      where: eq(sharedTraces.id, params.traceId),
    });

    if (!trace) {
      return NextResponse.json({ visibility: "private" });
    }

    return NextResponse.json({ visibility: "public" });
  } catch (error) {
    return NextResponse.json({ visibility: "private" }, { status: 500 });
  }
}
