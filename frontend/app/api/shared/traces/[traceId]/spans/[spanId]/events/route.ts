import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/drizzle";
import { events } from "@/lib/db/migrations/schema";

export async function GET(_req: Request, props: { params: Promise<{ spanId: string }> }): Promise<Response> {
  const params = await props.params;
  const spanId = params.spanId;

  const rows = await db.query.events.findMany({
    where: and(eq(events.spanId, spanId)),
    orderBy: asc(events.timestamp),
  });

  return NextResponse.json(rows);
}
