import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import { labelClasses, labels, spans, users } from "@/lib/db/migrations/schema";

export async function GET(
  _req: Request,
  props: { params: Promise<{ traceId: string; spanId: string }> }
): Promise<Response> {
  const params = await props.params;
  const spanId = params.spanId;
  const traceId = params.traceId;

  const span = await db.query.spans.findFirst({
    where: and(eq(spans.spanId, spanId), eq(spans.traceId, traceId)),
    columns: {
      spanId: true,
    },
  });

  if (!span) {
    return new Response(JSON.stringify({ error: "Span not found or does not belong to the given trace" }), {
      status: 404,
    });
  }

  const res = await db
    .select({
      id: labels.id,
      createdAt: labels.createdAt,
      classId: labels.classId,
      spanId: labels.spanId,
      name: labelClasses.name,
      email: users.email,
      color: labelClasses.color,
    })
    .from(labels)
    .innerJoin(labelClasses, eq(labels.classId, labelClasses.id))
    .leftJoin(users, eq(labels.userId, users.id))
    .where(eq(labels.spanId, spanId))
    .orderBy(desc(labels.createdAt));

  return new Response(JSON.stringify(res));
}
