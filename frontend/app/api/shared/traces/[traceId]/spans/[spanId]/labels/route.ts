import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import { labelClasses, labels, users } from "@/lib/db/migrations/schema";

export async function GET(_req: Request, props: { params: Promise<{ spanId: string }> }): Promise<Response> {
  const params = await props.params;
  const spanId = params.spanId;

  const res = await db
    .select({
      id: labels.id,
      createdAt: labels.createdAt,
      classId: labels.classId,
      spanId: labels.spanId,
      name: labelClasses.name,
      email: users.email,
    })
    .from(labels)
    .innerJoin(labelClasses, eq(labels.classId, labelClasses.id))
    .leftJoin(users, eq(labels.userId, users.id))
    .where(eq(labels.spanId, spanId))
    .orderBy(desc(labels.createdAt));

  return new Response(JSON.stringify(res), { status: 200 });
}
